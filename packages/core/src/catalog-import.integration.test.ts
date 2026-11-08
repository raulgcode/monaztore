import type { ImportedCatalog, ImportedProduct } from "@monaztore/contracts";
import { and, eq, schema } from "@monaztore/db";
import { createTestDatabase, createTestTenant } from "@monaztore/db/testing";
import { afterAll, describe, expect, it } from "vitest";
import { importCatalog, listImportedProducts, listVariants } from "./catalog-import";
import { resolveTenant } from "./workspaces";

const connection = createTestDatabase();
afterAll(() => connection.close());
const db = connection.db;

async function owner() {
  const tenant = await createTestTenant(db);
  const ctx = await resolveTenant(db, tenant.userId, tenant.slug);
  if (!ctx) throw new Error("no tenant");
  return ctx;
}

const shirt: ImportedProduct = {
  externalId: "102",
  slug: "camiseta-tica",
  name: "Camiseta Tica",
  description: "<p>Algodón</p>",
  shortDescription: "",
  status: "active",
  sku: null,
  price: 1_200_000,
  compareAtPrice: null,
  stockQuantity: null,
  inStock: true,
  weightGrams: 200,
  seoTitle: "Camiseta Tica",
  seoDescription: null,
  categoryExternalIds: ["16", "15"],
  images: [{ url: "https://shop.example/cam.jpg", alt: "Camiseta" }],
  options: [{ name: "Talla", values: ["S", "M"] }],
  variants: [
    {
      externalId: "201",
      sku: "CAM-S",
      options: { Talla: "S" },
      price: 1_000_000,
      compareAtPrice: 1_200_000,
      stockQuantity: 3,
      inStock: true,
      imageUrl: null,
    },
    {
      externalId: "202",
      sku: "CAM-M",
      options: { Talla: "M" },
      price: 1_200_000,
      compareAtPrice: null,
      stockQuantity: 0,
      inStock: false,
      imageUrl: null,
    },
  ],
  oldPath: "/producto/camiseta-tica/",
};

function catalog(overrides: Partial<ImportedCatalog> = {}): ImportedCatalog {
  return {
    source: "woocommerce",
    sourceUrl: "https://shop.example",
    currency: "CRC",
    categories: [
      {
        externalId: "15",
        parentExternalId: null,
        slug: "ropa",
        name: "Ropa",
        description: "",
        imageUrl: null,
        position: 0,
        oldPath: "/categoria-producto/ropa/",
      },
      {
        externalId: "16",
        parentExternalId: "15",
        slug: "camisetas",
        name: "Camisetas",
        description: "",
        imageUrl: null,
        position: 1,
        oldPath: null,
      },
    ],
    products: [shirt],
    customers: [
      {
        externalId: "7",
        email: "Ana@Example.com",
        firstName: "Ana",
        lastName: "Mora",
        phone: null,
        acceptsMarketing: false,
        ordersCount: 0,
        totalSpent: 0,
      },
    ],
    warnings: [],
    ...overrides,
  };
}

describe("importCatalog", () => {
  it("brings categories with their parent, products with variants, customers, pages and 301s", async () => {
    const ctx = await owner();

    const result = await importCatalog(
      ctx,
      catalog({
        pages: [
          {
            externalId: "7",
            slug: "faqs",
            title: "FAQs",
            status: "published",
            oldPath: "/preguntas/",
            blocks: [{ type: "text", id: "b1", html: "<p>Enviamos a todo el país.</p>" }],
          },
        ],
      }),
    );

    expect(result.stats).toEqual({
      categories: 2,
      products: 1,
      variants: 2,
      images: 1,
      customers: 1,
      pages: 1,
      redirects: 3,
    });
    const categories = await db
      .select()
      .from(schema.category)
      .where(eq(schema.category.organizationId, ctx.organizationId));
    const ropa = categories.find((c) => c.slug === "ropa");
    expect(categories.find((c) => c.slug === "camisetas")?.parentId).toBe(ropa?.id);

    const redirects = await db
      .select({ fromPath: schema.redirect.fromPath, toPath: schema.redirect.toPath })
      .from(schema.redirect)
      .where(eq(schema.redirect.organizationId, ctx.organizationId));
    expect(redirects).toEqual(
      expect.arrayContaining([
        { fromPath: "/producto/camiseta-tica/", toPath: "/products/camiseta-tica" },
        { fromPath: "/categoria-producto/ropa/", toPath: "/collections/ropa" },
        { fromPath: "/preguntas/", toPath: "/faqs" },
      ]),
    );
    const [page] = await db
      .select({ title: schema.page.title, status: schema.page.status })
      .from(schema.page)
      .where(eq(schema.page.organizationId, ctx.organizationId));
    expect(page).toEqual({ title: "FAQs", status: "published" });

    const [customer] = await db
      .select()
      .from(schema.customer)
      .where(eq(schema.customer.organizationId, ctx.organizationId));
    expect(customer).toMatchObject({ email: "ana@example.com", acceptsMarketing: false });

    const [run] = await db
      .select()
      .from(schema.importRun)
      .where(eq(schema.importRun.id, result.runId));
    expect(run?.status).toBe("succeeded");
  });

  it("running it again updates instead of duplicating, and drops variants gone from the source", async () => {
    const ctx = await owner();
    await importCatalog(ctx, catalog());

    await importCatalog(
      ctx,
      catalog({
        products: [{ ...shirt, name: "Camiseta Tica 2026", variants: shirt.variants.slice(0, 1) }],
      }),
    );

    const products = await listImportedProducts(ctx, "woocommerce");
    expect(products).toHaveLength(1);
    expect(products[0]?.name).toBe("Camiseta Tica 2026");
    const variants = await listVariants(
      ctx,
      products.map((p) => p.id),
    );
    expect(variants.map((v) => v.externalId)).toEqual(["201"]);
  });

  it("never takes back marketing consent the customer gave in the store", async () => {
    const ctx = await owner();
    await importCatalog(ctx, catalog());
    await db
      .update(schema.customer)
      .set({ acceptsMarketing: true, marketingConsentAt: new Date() })
      .where(
        and(
          eq(schema.customer.organizationId, ctx.organizationId),
          eq(schema.customer.email, "ana@example.com"),
        ),
      );

    await importCatalog(ctx, catalog());

    const [customer] = await db
      .select({ acceptsMarketing: schema.customer.acceptsMarketing })
      .from(schema.customer)
      .where(eq(schema.customer.organizationId, ctx.organizationId));
    expect(customer?.acceptsMarketing).toBe(true);
  });

  it("gives a new slug when the store already uses it for a product of its own", async () => {
    const ctx = await owner();
    await db
      .insert(schema.product)
      .values({ organizationId: ctx.organizationId, slug: "camiseta-tica", name: "Mía" });

    await importCatalog(ctx, catalog());

    const [imported] = await listImportedProducts(ctx, "woocommerce");
    expect(imported?.slug).toBe("camiseta-tica-2");
  });

  it("keeps each store's catalog to itself", async () => {
    const first = await owner();
    const second = await owner();
    await importCatalog(first, catalog());

    expect(await listImportedProducts(second, "woocommerce")).toEqual([]);
  });

  it("only owners import", async () => {
    const ctx = await owner();
    await expect(importCatalog({ ...ctx, role: "member" }, catalog())).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});
