import { randomUUID } from "node:crypto";
import type { ImportedCatalog, ImportedProduct } from "@monaztore/contracts";
import { createTestDatabase, createTestTenant } from "@monaztore/db/testing";
import { afterAll, describe, expect, it } from "vitest";
import { importCatalog } from "./catalog-import";
import {
  cleanHtml,
  findRedirect,
  getStoreCollection,
  getStoreInfo,
  getStoreProduct,
  listStoreProducts,
  listTopCollections,
  plainText,
  type StorefrontContext,
  sitemapEntries,
} from "./storefront";
import { addStoreDomain, resolveStoreByHost } from "./stores";
import { resolveTenant } from "./workspaces";

const connection = createTestDatabase();
afterAll(() => connection.close());
const db = connection.db;

const product = (overrides: Partial<ImportedProduct>): ImportedProduct => ({
  externalId: randomUUID(),
  slug: "producto",
  name: "Producto",
  description: "",
  shortDescription: "",
  status: "active",
  sku: null,
  price: 500_000,
  compareAtPrice: null,
  stockQuantity: null,
  inStock: true,
  weightGrams: null,
  seoTitle: null,
  seoDescription: null,
  categoryExternalIds: [],
  images: [],
  options: [],
  variants: [],
  oldPath: null,
  ...overrides,
});

const catalog: ImportedCatalog = {
  source: "woocommerce",
  sourceUrl: "https://shop.example",
  currency: "CRC",
  categories: [
    {
      externalId: "1",
      parentExternalId: null,
      slug: "ropa",
      name: "Ropa",
      description: "<p>Todo para <b>vestir</b></p>",
      imageUrl: null,
      position: 0,
      oldPath: "/categoria-producto/ropa/",
    },
    {
      externalId: "2",
      parentExternalId: "1",
      slug: "camisetas",
      name: "Camisetas",
      description: "",
      imageUrl: null,
      position: 0,
      oldPath: null,
    },
  ],
  products: [
    product({
      slug: "camiseta",
      name: "Camiseta Tica",
      description: '<p>Algodón</p><script>alert(1)</script><a href="javascript:x">mal</a>',
      categoryExternalIds: ["2"],
      images: [
        { url: "https://shop.example/a.jpg", alt: "" },
        { url: "https://shop.example/b.jpg", alt: "Espalda" },
      ],
      options: [{ name: "Talla", values: ["S", "M"] }],
      variants: [
        {
          externalId: "v1",
          sku: "S",
          options: { Talla: "S" },
          price: 900_000,
          compareAtPrice: null,
          stockQuantity: 0,
          inStock: false,
          imageUrl: null,
        },
        {
          externalId: "v2",
          sku: "M",
          options: { Talla: "M" },
          price: 1_000_000,
          compareAtPrice: null,
          stockQuantity: 2,
          inStock: true,
          imageUrl: null,
        },
      ],
      oldPath: "/producto/camiseta/",
    }),
    product({ slug: "taza", name: "Taza Pura Vida" }),
    product({ slug: "borrador", name: "Gorra en preparación", status: "draft" }),
  ],
  customers: [],
  warnings: [],
};

/** A store with the catalog above, on its own domain, as a visitor sees it. */
async function storeWithCatalog(): Promise<StorefrontContext> {
  const tenant = await createTestTenant(db);
  const owner = await resolveTenant(db, tenant.userId, tenant.slug);
  if (!owner) throw new Error("no tenant");
  await importCatalog(owner, catalog);
  const hostname = `tienda-${randomUUID().slice(0, 8)}.test`;
  await addStoreDomain(owner, hostname, { primary: true });
  const store = await resolveStoreByHost(db, hostname);
  if (!store) throw new Error("no store");
  return { db, store };
}

describe("storefront", () => {
  it("lists only active products, with their lowest price, first two photos and first option", async () => {
    const ctx = await storeWithCatalog();

    const page = await listStoreProducts(ctx);

    expect(page.total).toBe(2);
    expect(page.products.map((p) => p.slug).sort()).toEqual(["camiseta", "taza"]);
    expect(page.products.find((p) => p.slug === "camiseta")).toMatchObject({
      price: 900_000,
      imageUrl: "https://shop.example/a.jpg",
      imageAlt: "Camiseta Tica",
      hoverImageUrl: "https://shop.example/b.jpg",
      firstOption: { name: "Talla", values: ["S", "M"] },
    });
    expect(page.products.find((p) => p.slug === "taza")).toMatchObject({
      hoverImageUrl: null,
      firstOption: null,
    });
  });

  it("a collection also shows its subcollections' products, and search matches names", async () => {
    const ctx = await storeWithCatalog();

    expect((await listStoreProducts(ctx, { collection: "ropa" })).products).toHaveLength(1);
    expect((await listStoreProducts(ctx, { collection: "nada" })).total).toBe(0);
    expect((await listStoreProducts(ctx, { q: "pura" })).products.map((p) => p.slug)).toEqual([
      "taza",
    ]);
    expect((await listStoreProducts(ctx, { q: "%" })).total).toBe(0);
  });

  it("shows a product with variants and clean HTML, and hides drafts", async () => {
    const ctx = await storeWithCatalog();

    const shirt = await getStoreProduct(ctx, "camiseta");

    expect(shirt).toMatchObject({
      name: "Camiseta Tica",
      price: 900_000,
      inStock: true,
      summary: "Algodónmal",
      options: [{ name: "Talla", values: ["S", "M"] }],
      collections: [{ slug: "camisetas", name: "Camisetas" }],
    });
    expect(shirt?.descriptionHtml).not.toContain("script");
    expect(shirt?.descriptionHtml).not.toContain("javascript:");
    expect(shirt?.images.map((i) => i.alt)).toEqual(["Camiseta Tica", "Espalda"]);
    expect(await getStoreProduct(ctx, "borrador")).toBeUndefined();
  });

  it("shows a collection with its parent and the top collections for the menu", async () => {
    const ctx = await storeWithCatalog();

    expect(await getStoreCollection(ctx, "camisetas")).toMatchObject({
      name: "Camisetas",
      parent: { slug: "ropa", name: "Ropa" },
    });
    expect((await getStoreCollection(ctx, "ropa"))?.summary).toBe("Todo para vestir");
    expect(await listTopCollections(ctx)).toEqual([{ slug: "ropa", name: "Ropa", imageUrl: null }]);
  });

  it("finds where an old WordPress address moved, with or without its trailing slash", async () => {
    const ctx = await storeWithCatalog();

    expect(await findRedirect(ctx, "/producto/camiseta/")).toBe("/products/camiseta");
    expect(await findRedirect(ctx, "/producto/camiseta")).toBe("/products/camiseta");
    expect(await findRedirect(ctx, "/nada")).toBeUndefined();
  });

  it("puts collections and active products in the sitemap, and canonical links on the primary domain", async () => {
    const ctx = await storeWithCatalog();

    const paths = (await sitemapEntries(ctx)).map((entry) => entry.path);

    expect(paths).toEqual([
      "/collections/camisetas",
      "/collections/ropa",
      "/products/camiseta",
      "/products/taza",
    ]);
    expect(await getStoreInfo(ctx)).toMatchObject({
      currency: "CRC",
      canonicalHost: ctx.store.hostname,
    });
  });

  it("never shows another store's catalog", async () => {
    const first = await storeWithCatalog();
    const tenant = await createTestTenant(db);
    const other: StorefrontContext = {
      db,
      store: {
        organizationId: tenant.organizationId,
        name: "Otra",
        slug: tenant.slug,
        hostname: "x.test",
      },
    };

    expect(first.store.organizationId).not.toBe(tenant.organizationId);
    expect((await listStoreProducts(other)).total).toBe(0);
    expect(await getStoreProduct(other, "camiseta")).toBeUndefined();
    expect(await getStoreCollection(other, "ropa")).toBeUndefined();
    expect(await findRedirect(other, "/producto/camiseta/")).toBeUndefined();
  });
});

describe("cleanHtml and plainText", () => {
  it("keeps formatting and safe links, drops the rest", () => {
    expect(cleanHtml('<p onclick="x">Hola <img src="x"><a href="https://a.cr">a</a></p>')).toBe(
      '<p>Hola <a href="https://a.cr" rel="nofollow noopener" target="_blank">a</a></p>',
    );
  });
  it("cuts long text with an ellipsis", () => {
    expect(plainText("<p>uno dos tres</p>", 8)).toBe("uno dos…");
  });
});
