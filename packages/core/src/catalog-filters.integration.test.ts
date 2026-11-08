import { randomUUID } from "node:crypto";
import type { ImportedCatalog, ImportedProduct } from "@monaztore/contracts";
import { createTestDatabase, createTestTenant } from "@monaztore/db/testing";
import { afterAll, describe, expect, it } from "vitest";
import { importCatalog } from "./catalog-import";
import {
  listStoreFacets,
  listStoreOptionNames,
  listStoreProducts,
  type StorefrontContext,
} from "./storefront";
import { addStoreDomain, resolveStoreByHost } from "./stores";
import type { TenantContext } from "./tenant";
import { resolveTenant } from "./workspaces";

const connection = createTestDatabase();
afterAll(() => connection.close());
const db = connection.db;

const sock = (
  slug: string,
  price: number,
  options: Record<string, string[]>,
  extra: Partial<ImportedProduct> = {},
): ImportedProduct => ({
  externalId: randomUUID(),
  slug,
  name: `Medias ${slug}`,
  description: "",
  shortDescription: "",
  status: "active",
  sku: slug.toUpperCase(),
  price,
  compareAtPrice: null,
  stockQuantity: null,
  inStock: true,
  weightGrams: null,
  seoTitle: null,
  seoDescription: null,
  categoryExternalIds: ["1"],
  images: [],
  options: Object.entries(options).map(([name, values]) => ({ name, values })),
  variants: [],
  oldPath: null,
  ...extra,
});

/** A sock shop: sizes and colors, a sale and something sold out. */
async function sockShop(): Promise<StorefrontContext & { owner: TenantContext }> {
  const tenant = await createTestTenant(db);
  const owner = await resolveTenant(db, tenant.userId, tenant.slug);
  if (!owner) throw new Error("no tenant");
  const catalog: ImportedCatalog = {
    source: "woocommerce",
    sourceUrl: "https://shop.example",
    currency: "CRC",
    categories: [
      {
        externalId: "1",
        parentExternalId: null,
        slug: "medias",
        name: "Medias",
        description: "",
        imageUrl: null,
        position: 0,
        oldPath: null,
      },
    ],
    products: [
      sock("rayas", 300_000, { Talla: ["S", "M"], Color: ["Rojo"] }),
      sock("puntos", 500_000, { Talla: ["M", "L"], Color: ["Azul"] }, { compareAtPrice: 700_000 }),
      sock("lisas", 800_000, { Talla: ["L"], Color: ["Rojo"] }, { inStock: false }),
      sock("taza", 1_000_000, {}, { categoryExternalIds: [], name: "Taza" }),
    ],
    customers: [],
    warnings: [],
  };
  await importCatalog(owner, catalog);
  const hostname = `medias-${randomUUID().slice(0, 8)}.test`;
  await addStoreDomain(owner, hostname, { primary: true });
  const store = await resolveStoreByHost(db, hostname);
  if (!store) throw new Error("no store");
  return { db, store, owner };
}

const slugs = async (ctx: StorefrontContext, query: Parameters<typeof listStoreProducts>[1]) =>
  (await listStoreProducts(ctx, query)).products.map((p) => p.slug);

describe("catalog filters", () => {
  it("narrows by an option's values, by price, stock and sale", async () => {
    const ctx = await sockShop();

    expect((await slugs(ctx, { options: { Talla: ["L"] } })).toSorted()).toEqual([
      "lisas",
      "puntos",
    ]);
    expect(await slugs(ctx, { options: { Talla: ["M"], Color: ["Rojo"] } })).toEqual(["rayas"]);
    expect((await slugs(ctx, { minPrice: 400_000, maxPrice: 800_000 })).toSorted()).toEqual([
      "lisas",
      "puntos",
    ]);
    expect((await slugs(ctx, { inStock: true, collection: "medias" })).toSorted()).toEqual([
      "puntos",
      "rayas",
    ]);
    expect(await slugs(ctx, { onSale: true })).toEqual(["puntos"]);
  });

  it("orders by price both ways and by name", async () => {
    const ctx = await sockShop();

    expect(await slugs(ctx, { sort: "price-asc" })).toEqual(["rayas", "puntos", "lisas", "taza"]);
    expect(await slugs(ctx, { sort: "price-desc" })).toEqual(["taza", "lisas", "puntos", "rayas"]);
    expect((await listStoreProducts(ctx, { sort: "name" })).products[0]?.name).toBe("Medias lisas");
  });

  it("counts each value with the other filters on, sizes in reading order", async () => {
    const ctx = await sockShop();

    const facets = await listStoreFacets(ctx, {
      collection: "medias",
      options: { Talla: ["L"], Color: ["Rojo"] },
    });

    // Options used by as many products go A–Z.
    expect(facets.options).toEqual([
      // With Talla = L on: puntos (Azul) and lisas (Rojo).
      {
        name: "Color",
        values: [
          { value: "Azul", count: 1 },
          { value: "Rojo", count: 1 },
        ],
      },
      // With Color = Rojo on: rayas (S, M) and lisas (L).
      {
        name: "Talla",
        values: [
          { value: "S", count: 1 },
          { value: "M", count: 1 },
          { value: "L", count: 1 },
        ],
      },
    ]);
    // Only lisas is left, at one price: nothing to narrow by price.
    expect(facets.price).toBeNull();
    expect(facets.inStock).toBe(0);
  });

  it("offers no price filter when everything costs the same, unless a price range is already on", async () => {
    const ctx = await sockShop();
    const onePrice = { collection: "medias", options: { Talla: ["L"], Color: ["Rojo"] } };

    expect((await listStoreFacets(ctx, onePrice)).price).toBeNull();
    expect((await listStoreFacets(ctx, { ...onePrice, minPrice: 500_000 })).price).toEqual({
      min: 800_000,
      max: 800_000,
    });
  });

  it("gives the whole price range and what's on sale or in stock", async () => {
    const ctx = await sockShop();

    const facets = await listStoreFacets(ctx);

    expect(facets.price).toEqual({ min: 300_000, max: 1_000_000 });
    expect(facets).toMatchObject({ inStock: 3, onSale: 1 });
  });

  it("names the store's options for Design, the most used first, never another store's", async () => {
    const [ours] = await Promise.all([sockShop(), sockShop()]);
    const empty = await createTestTenant(db);
    const other = await resolveTenant(db, empty.userId, empty.slug);
    if (!other) throw new Error("no tenant");

    expect(await listStoreOptionNames(ours.owner)).toEqual(["Color", "Talla"]);
    expect(await listStoreOptionNames(other)).toEqual([]);
  });

  it("never counts another store's products", async () => {
    const [ours, theirs] = await Promise.all([sockShop(), sockShop()]);

    expect((await listStoreFacets(ours)).inStock).toBe(3);
    expect((await listStoreProducts(theirs, { options: { Talla: ["L"] } })).total).toBe(2);
  });
});
