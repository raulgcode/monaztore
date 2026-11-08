import type { ImportedCatalog } from "@monaztore/contracts";
import { eq, schema } from "@monaztore/db";
import { createTestDatabase, createTestTenant } from "@monaztore/db/testing";
import { memoryFileStore } from "@monaztore/storage";
import { afterAll, describe, expect, it } from "vitest";
import { copyCatalogImages, mediaKeyOf, mediaPath } from "./catalog-images";
import { importCatalog, listImportedProducts } from "./catalog-import";
import { resolveTenant } from "./workspaces";

const connection = createTestDatabase();
afterAll(() => connection.close());
const db = connection.db;

async function tenant(role: "owner" | "member" = "owner") {
  const created = await createTestTenant(db);
  const ctx = await resolveTenant(db, created.userId, created.slug);
  if (!ctx) throw new Error("no tenant");
  return { ...ctx, role };
}

const catalog = (): ImportedCatalog => ({
  source: "woocommerce",
  sourceUrl: "https://shop.example",
  currency: "CRC",
  categories: [
    {
      externalId: "15",
      parentExternalId: null,
      slug: "medias",
      name: "Medias",
      description: "",
      imageUrl: "https://shop.example/medias.png",
      position: 0,
      oldPath: null,
    },
  ],
  products: [
    {
      externalId: "1",
      slug: "medias-gato",
      name: "Medias gato",
      description: "",
      shortDescription: "",
      status: "active",
      sku: null,
      price: 450_000,
      compareAtPrice: null,
      stockQuantity: null,
      inStock: true,
      weightGrams: null,
      seoTitle: null,
      seoDescription: null,
      categoryExternalIds: ["15"],
      images: [
        { url: "https://shop.example/gato.png", alt: "Gato" },
        { url: "https://shop.example/gone.png", alt: "" },
      ],
      options: [],
      variants: [
        {
          externalId: "11",
          sku: null,
          options: {},
          price: null,
          compareAtPrice: null,
          stockQuantity: null,
          inStock: true,
          // The same file as the product's first photo: downloaded once.
          imageUrl: "https://shop.example/gato.png",
        },
      ],
      oldPath: null,
    },
  ],
  customers: [],
  warnings: [],
});

/** A shop whose files are their own URL as bytes; `gone.png` answers 404. */
function fakeShop() {
  const downloads: string[] = [];
  return {
    downloads,
    download: async (url: string) => {
      downloads.push(url);
      if (url.endsWith("gone.png")) throw new Error(`404 for ${url}`);
      return new TextEncoder().encode(url);
    },
    convert: async (bytes: Uint8Array) => ({
      body: bytes,
      contentType: "image/webp",
      extension: "webp",
    }),
  };
}

describe("copyCatalogImages", () => {
  it("copies every photo to the store's files once and points the catalog at our copies", async () => {
    const ctx = await tenant();
    const files = memoryFileStore();
    const shop = fakeShop();

    const result = await copyCatalogImages(ctx, catalog(), { files, ...shop });

    expect(shop.downloads.toSorted()).toEqual([
      "https://shop.example/gato.png",
      "https://shop.example/gone.png",
      "https://shop.example/medias.png",
    ]);
    expect(result.copied).toBe(2);
    expect(files.keys()).toHaveLength(2);
    for (const key of files.keys()) {
      expect(key.startsWith(`organizations/${ctx.organizationId}/images/`)).toBe(true);
    }

    const [product] = result.catalog.products;
    const photo = product?.images[0]?.url ?? "";
    expect(photo).toMatch(/^\/media\/organizations\/.+\.webp$/);
    expect(product?.variants[0]?.imageUrl).toBe(photo);
    expect(result.catalog.categories[0]?.imageUrl).toMatch(/^\/media\//);
    // What couldn't be copied keeps its old address and is reported.
    expect(product?.images[1]?.url).toBe("https://shop.example/gone.png");
    expect(result.catalog.warnings).toEqual([
      "Couldn't copy https://shop.example/gone.png: 404 for https://shop.example/gone.png",
    ]);

    const key = mediaKeyOf(photo);
    expect(key && new TextDecoder().decode((await files.get(key)) ?? new Uint8Array())).toBe(
      "https://shop.example/gato.png",
    );

    await importCatalog(ctx, result.catalog);
    const [imported] = await listImportedProducts(ctx, "woocommerce");
    const rows = await db
      .select({ url: schema.productImage.url })
      .from(schema.productImage)
      .where(eq(schema.productImage.productId, imported?.id ?? ""))
      .orderBy(schema.productImage.position);
    expect(rows.map((row) => row.url)).toEqual([photo, "https://shop.example/gone.png"]);
  });

  it("leaves our own copies alone on a second run", async () => {
    const ctx = await tenant();
    const files = memoryFileStore();
    const first = await copyCatalogImages(ctx, catalog(), { files, ...fakeShop() });
    const shop = fakeShop();
    const second = await copyCatalogImages(ctx, first.catalog, { files, ...shop });
    expect(shop.downloads).toEqual(["https://shop.example/gone.png"]);
    expect(second.catalog.products[0]?.images[0]?.url).toBe(
      first.catalog.products[0]?.images[0]?.url,
    );
  });

  it("is only for owners", async () => {
    const ctx = await tenant("member");
    await expect(
      copyCatalogImages(ctx, catalog(), { files: memoryFileStore(), ...fakeShop() }),
    ).rejects.toThrow(/owners/);
  });
});

describe("mediaPath", () => {
  it("only reads keys of a store's files", () => {
    expect(mediaPath("organizations/o1/images/abc.webp")).toBe(
      "/media/organizations/o1/images/abc.webp",
    );
    expect(mediaKeyOf("/media/organizations/o1/images/abc.webp")).toBe(
      "organizations/o1/images/abc.webp",
    );
    expect(mediaKeyOf("https://shop.example/a.png")).toBeNull();
    expect(mediaKeyOf("/media/../../etc/passwd")).toBeNull();
    expect(mediaKeyOf("/media/help/a.webp")).toBeNull();
  });
});
