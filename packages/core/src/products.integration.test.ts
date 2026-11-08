import { type ProductInput, readProductListQuery } from "@monaztore/contracts";
import { and, eq, schema } from "@monaztore/db";
import { createTestDatabase, createTestTenant } from "@monaztore/db/testing";
import { afterAll, describe, expect, it } from "vitest";
import { priceCart } from "./orders";
import {
  bulkUpdateProducts,
  createCategory,
  deleteCategory,
  duplicateProduct,
  getEditableProduct,
  listCategories,
  listProducts,
  saveProduct,
} from "./products";
import { getStoreProduct, listStoreProducts, type StorefrontContext } from "./storefront";
import type { TenantContext } from "./tenant";
import { resolveTenant } from "./workspaces";

const connection = createTestDatabase();
afterAll(() => connection.close());
const db = connection.db;

async function store() {
  const tenant = await createTestTenant(db);
  const owner = (await resolveTenant(db, tenant.userId, tenant.slug)) as TenantContext;
  const shop: StorefrontContext = {
    db,
    store: {
      organizationId: tenant.organizationId,
      name: "Tienda",
      slug: tenant.slug,
      hostname: "t.test",
    },
  };
  return { owner, shop, organizationId: tenant.organizationId };
}

const product = (overrides: Partial<ProductInput> = {}): ProductInput => ({
  name: "Camisa",
  slug: "",
  status: "active",
  description: "<p>De algodón</p>",
  shortDescription: "",
  sku: null,
  price: 1_000_000,
  compareAtPrice: null,
  saleStartsAt: null,
  saleEndsAt: null,
  stockQuantity: null,
  inStock: true,
  weightGrams: null,
  seoTitle: null,
  seoDescription: null,
  categoryIds: [],
  images: [],
  attributes: [],
  variants: [],
  ...overrides,
});

const list = (owner: TenantContext, search = "") =>
  listProducts(owner, readProductListQuery(new URLSearchParams(search)));

const variant = (
  options: Record<string, string>,
  overrides: Partial<ProductInput["variants"][number]> = {},
) => ({
  options,
  sku: null,
  price: null,
  compareAtPrice: null,
  stockQuantity: null,
  inStock: true,
  imageUrl: null,
  ...overrides,
});

describe("saveProduct", () => {
  it("creates a product with its photos, attributes, variants and collections", async () => {
    const { owner, organizationId, shop } = await store();
    const shirts = await createCategory(owner, { name: "Camisas" });
    const photo = `/media/organizations/${organizationId}/images/a.webp`;
    const id = await saveProduct(
      owner,
      null,
      product({
        sku: "CAM",
        categoryIds: [shirts.id],
        images: [{ url: photo, alt: "De frente" }],
        attributes: [
          { name: "Talla", values: ["S", "M"], variation: true },
          { name: "Material", values: ["Algodón"], variation: false },
        ],
        variants: [
          variant({ Talla: "S" }, { sku: "CAM-S", stockQuantity: 3, inStock: true }),
          variant(
            { Talla: "M" },
            { sku: "CAM-M", price: 1_200_000, stockQuantity: 0, inStock: false },
          ),
        ],
      }),
    );

    const saved = await getEditableProduct(owner, id);
    expect(saved).toMatchObject({
      slug: "camisa",
      categoryIds: [shirts.id],
      images: [{ url: photo, alt: "De frente" }],
      attributes: [
        { name: "Talla", values: ["S", "M"], variation: true },
        { name: "Material", values: ["Algodón"], variation: false },
      ],
    });
    expect(saved?.variants.map((v) => [v.sku, v.stockQuantity, v.inStock])).toEqual([
      ["CAM-S", 3, true],
      ["CAM-M", 0, false],
    ]);
    // The storefront offers only what the shopper picks; the rest describes the product.
    const page = await getStoreProduct(shop, "camisa");
    expect(page?.options).toEqual([{ name: "Talla", values: ["S", "M"] }]);
    expect(page?.details).toEqual([{ name: "Material", values: ["Algodón"] }]);
  });

  it("keeps variant ids that stay, so carts still find them, and drops the rest", async () => {
    const { owner } = await store();
    const attributes = [{ name: "Talla", values: ["S", "M"], variation: true }];
    const id = await saveProduct(
      owner,
      null,
      product({ attributes, variants: [variant({ Talla: "S" }), variant({ Talla: "M" })] }),
    );
    const before = await getEditableProduct(owner, id);
    const small = before?.variants[0]?.id as string;

    await saveProduct(
      owner,
      id,
      product({
        attributes: [{ name: "Talla", values: ["S", "L"], variation: true }],
        variants: [variant({ Talla: "S" }, { id: small, price: 900_000 }), variant({ Talla: "L" })],
      }),
    );

    const after = await getEditableProduct(owner, id);
    expect(after?.variants.map((v) => [v.options.Talla, v.price])).toEqual([
      ["S", 900_000],
      ["L", null],
    ]);
    expect(after?.variants[0]?.id).toBe(small);
  });

  it("refuses a variant that isn't one of the attribute's values", async () => {
    const { owner } = await store();
    await expect(
      saveProduct(
        owner,
        null,
        product({
          attributes: [{ name: "Talla", values: ["S"], variation: true }],
          variants: [variant({ Talla: "XL" })],
        }),
      ),
    ).rejects.toMatchObject({ code: "variants_invalid" });
  });

  it("refuses an SKU another product of the store has, but not another store's", async () => {
    const { owner } = await store();
    const other = await store();
    await saveProduct(owner, null, product({ sku: "TAZA-1" }));
    await saveProduct(other.owner, null, product({ sku: "TAZA-1" }));
    await expect(
      saveProduct(owner, null, product({ name: "Otra", sku: "taza-1" })),
    ).rejects.toMatchObject({
      code: "sku_taken",
    });
  });

  it("refuses a photo of another store", async () => {
    const { owner } = await store();
    const other = await store();
    await expect(
      saveProduct(
        owner,
        null,
        product({
          images: [{ url: `/media/organizations/${other.organizationId}/x.webp`, alt: "" }],
        }),
      ),
    ).rejects.toMatchObject({ code: "image_invalid" });
  });

  it("leaves a 301 when a published product changes address", async () => {
    const { owner, organizationId } = await store();
    const id = await saveProduct(owner, null, product());
    await saveProduct(owner, id, product({ slug: "camisa-azul" }));
    const [redirect] = await db
      .select({ toPath: schema.redirect.toPath })
      .from(schema.redirect)
      .where(
        and(
          eq(schema.redirect.organizationId, organizationId),
          eq(schema.redirect.fromPath, "/products/camisa"),
        ),
      );
    expect(redirect?.toPath).toBe("/products/camisa-azul");
    // Another product can't take an address in use.
    await expect(
      saveProduct(owner, null, product({ name: "Otra", slug: "camisa-azul" })),
    ).rejects.toMatchObject({
      code: "slug_taken",
    });
  });

  it("applies an offer only between its dates", async () => {
    const { owner, shop } = await store();
    const id = await saveProduct(
      owner,
      null,
      product({
        price: 800_000,
        compareAtPrice: 1_000_000,
        saleStartsAt: new Date(Date.now() + 86_400_000),
        saleEndsAt: null,
      }),
    );
    const notYet = await priceCart(shop, [{ productId: id, variantId: null, quantity: 1 }]);
    expect(notYet.lines[0]).toMatchObject({ unitPrice: 1_000_000, compareAtPrice: null });
    expect((await listStoreProducts(shop, { onSale: true })).total).toBe(0);

    const tomorrow = await priceCart(shop, [{ productId: id, variantId: null, quantity: 1 }], {
      now: new Date(Date.now() + 2 * 86_400_000),
    });
    expect(tomorrow.lines[0]).toMatchObject({ unitPrice: 800_000, compareAtPrice: 1_000_000 });

    await saveProduct(owner, id, product({ price: 800_000, compareAtPrice: 1_000_000 }));
    expect((await listStoreProducts(shop, { onSale: true })).total).toBe(1);
  });
});

describe("listProducts", () => {
  it("searches by name or SKU and filters by status, stock and collection", async () => {
    const { owner } = await store();
    const mugs = await createCategory(owner, { name: "Tazas" });
    await saveProduct(
      owner,
      null,
      product({
        name: "Taza roja",
        sku: "TZ-R",
        stockQuantity: 2,
        inStock: true,
        categoryIds: [mugs.id],
      }),
    );
    await saveProduct(
      owner,
      null,
      product({ name: "Taza azul", status: "draft", stockQuantity: 0, inStock: false }),
    );
    await saveProduct(owner, null, product({ name: "Plato" }));

    expect((await list(owner, "q=taza")).products.map((p) => p.name).sort()).toEqual([
      "Taza azul",
      "Taza roja",
    ]);
    expect((await list(owner, "q=tz-r")).products.map((p) => p.name)).toEqual(["Taza roja"]);
    expect((await list(owner, "status=draft")).products.map((p) => p.name)).toEqual(["Taza azul"]);
    expect((await list(owner, "stock=out")).products.map((p) => p.name)).toEqual(["Taza azul"]);
    expect((await list(owner, "stock=low")).products.map((p) => p.name)).toEqual(["Taza roja"]);
    expect((await list(owner, `category=${mugs.id}`)).products.map((p) => p.name)).toEqual([
      "Taza roja",
    ]);
    expect((await list(owner)).counts).toEqual({ all: 3, active: 2, draft: 1, archived: 0 });
  });

  it("never shows another store's products", async () => {
    const { owner } = await store();
    const other = await store();
    await saveProduct(other.owner, null, product({ name: "Ajeno" }));
    expect((await list(owner)).total).toBe(0);
    await expect(
      bulkUpdateProducts(owner, {
        action: "delete",
        ids: [(await list(other.owner)).products[0]?.id as string],
      }),
    ).resolves.toBe(0);
    expect((await list(other.owner)).total).toBe(1);
  });
});

describe("bulkUpdateProducts", () => {
  it("publishes, hides, puts on offer and ends the offer of the selected products", async () => {
    const { owner, shop } = await store();
    const a = await saveProduct(
      owner,
      null,
      product({ name: "A", status: "draft", price: 1_000_000 }),
    );
    const b = await saveProduct(
      owner,
      null,
      product({
        name: "B",
        status: "draft",
        price: null,
        attributes: [{ name: "Talla", values: ["S"], variation: true }],
        variants: [variant({ Talla: "S" }, { price: 2_000_000 })],
      }),
    );

    expect(await bulkUpdateProducts(owner, { action: "publish", ids: [a, b] })).toBe(2);
    await bulkUpdateProducts(owner, { action: "offer", ids: [a, b], percent: 25 });
    const offered = await priceCart(shop, [
      { productId: a, variantId: null, quantity: 1 },
      {
        productId: b,
        variantId: (await getEditableProduct(owner, b))?.variants[0]?.id as string,
        quantity: 1,
      },
    ]);
    expect(offered.lines.map((l) => [l.unitPrice, l.compareAtPrice])).toEqual([
      [750_000, 1_000_000],
      [1_500_000, 2_000_000],
    ]);

    await bulkUpdateProducts(owner, { action: "offer", ids: [a], percent: 0 });
    expect(await getEditableProduct(owner, a)).toMatchObject({
      price: 1_000_000,
      compareAtPrice: null,
    });

    await bulkUpdateProducts(owner, { action: "archive", ids: [a] });
    expect((await list(owner, "status=archived")).products.map((p) => p.name)).toEqual(["A"]);
  });

  it("adds the selected products to a collection", async () => {
    const { owner } = await store();
    const sale = await createCategory(owner, { name: "Rebajas" });
    const a = await saveProduct(owner, null, product({ name: "A" }));
    await bulkUpdateProducts(owner, { action: "addCategory", ids: [a], categoryId: sale.id });
    expect((await getEditableProduct(owner, a))?.categoryIds).toEqual([sale.id]);
  });
});

describe("duplicateProduct", () => {
  it("makes a draft copy without the SKUs", async () => {
    const { owner } = await store();
    const id = await saveProduct(
      owner,
      null,
      product({
        sku: "X-1",
        attributes: [{ name: "Talla", values: ["S"], variation: true }],
        variants: [variant({ Talla: "S" }, { sku: "X-1-S" })],
      }),
    );
    const copy = await getEditableProduct(owner, await duplicateProduct(owner, id));
    expect(copy).toMatchObject({
      name: "Camisa (copy)",
      slug: "camisa-copy",
      status: "draft",
      sku: null,
    });
    expect(copy?.variants.map((v) => [v.options, v.sku])).toEqual([[{ Talla: "S" }, null]]);
  });
});

describe("collections", () => {
  it("lists children under their parent and moves them up when the parent goes", async () => {
    const { owner } = await store();
    const clothes = await createCategory(owner, { name: "Ropa" });
    const shirts = await createCategory(owner, { name: "Camisas", parentId: clothes.id });
    await createCategory(owner, { name: "Ropa" });
    expect((await listCategories(owner)).map((c) => c.slug)).toEqual(["ropa", "camisas", "ropa-2"]);
    await deleteCategory(owner, clothes.id);
    expect((await listCategories(owner)).find((c) => c.id === shirts.id)?.parentId).toBeNull();
  });
});
