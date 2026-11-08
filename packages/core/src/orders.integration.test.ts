import { randomUUID } from "node:crypto";
import type { CheckoutInput, ImportedProduct } from "@monaztore/contracts";
import { eq, schema } from "@monaztore/db";
import { createTestDatabase, createTestTenant } from "@monaztore/db/testing";
import { afterAll, describe, expect, it } from "vitest";
import { importCatalog, listImportedProducts, listVariants } from "./catalog-import";
import {
  getOrderByToken,
  getPaymentOptions,
  placeOrder,
  priceCart,
  submitPaymentReference,
  updateStorePayments,
} from "./orders";
import type { StorefrontContext } from "./storefront";
import type { TenantContext } from "./tenant";
import { resolveTenant } from "./workspaces";

const connection = createTestDatabase();
afterAll(() => connection.close());
const db = connection.db;

const base = (overrides: Partial<ImportedProduct>): ImportedProduct => ({
  externalId: randomUUID(),
  slug: "x",
  name: "X",
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

const checkout: CheckoutInput = {
  email: "ana@example.com",
  name: "Ana Mora",
  phone: "8888-0000",
  line1: "100 m norte del parque",
  city: "Heredia",
  province: "Heredia",
  notes: "",
  paymentMethod: "sinpe",
};

/** A store with a mug (2 in stock), a shirt in two sizes and a draft, taking SINPE. */
async function shop() {
  const tenant = await createTestTenant(db);
  const owner = (await resolveTenant(db, tenant.userId, tenant.slug)) as TenantContext;
  await importCatalog(owner, {
    source: "woocommerce",
    sourceUrl: "https://shop.example",
    currency: "CRC",
    categories: [],
    products: [
      base({ externalId: "mug", slug: "mug", name: "Mug", price: 600_000, stockQuantity: 2 }),
      base({
        externalId: "shirt",
        slug: "shirt",
        name: "Shirt",
        price: null,
        options: [{ name: "Size", values: ["S", "M"] }],
        variants: [
          {
            externalId: "s",
            sku: "SH-S",
            options: { Size: "S" },
            price: 1_000_000,
            compareAtPrice: null,
            stockQuantity: null,
            inStock: true,
            imageUrl: null,
          },
          {
            externalId: "m",
            sku: "SH-M",
            options: { Size: "M" },
            price: 1_200_000,
            compareAtPrice: null,
            stockQuantity: null,
            inStock: false,
            imageUrl: null,
          },
        ],
      }),
      base({ externalId: "draft", slug: "draft", name: "Draft", status: "draft" }),
    ],
    customers: [],
    warnings: [],
  });
  await updateStorePayments(owner, {
    sinpe: { enabled: true, phone: "8888-1234", holder: "Tienda S.A." },
    transfer: { enabled: false, bank: "BN", iban: "CR00", holder: "Tienda S.A." },
  });
  const products = await listImportedProducts(owner, "woocommerce");
  const id = (slug: string) => products.find((p) => p.slug === slug)?.id as string;
  const variants = await listVariants(owner, [id("shirt")]);
  const variant = (externalId: string) =>
    variants.find((v) => v.externalId === externalId)?.id as string;
  const store: StorefrontContext = {
    db,
    store: {
      organizationId: tenant.organizationId,
      name: "Tienda",
      slug: tenant.slug,
      hostname: "t.test",
    },
  };
  return { owner, store, id, variant };
}

describe("priceCart", () => {
  it("prices from the database and leaves out what can't be bought", async () => {
    const { store, id, variant } = await shop();

    const cart = await priceCart(store, [
      { productId: id("mug"), variantId: null, quantity: 5 },
      { productId: id("shirt"), variantId: variant("s"), quantity: 2 },
      { productId: id("shirt"), variantId: variant("m"), quantity: 1 },
      { productId: id("shirt"), variantId: null, quantity: 1 },
      { productId: id("draft"), variantId: null, quantity: 1 },
    ]);

    expect(cart.lines.map((l) => [l.name, l.variantTitle, l.quantity, l.lineTotal])).toEqual([
      ["Mug", null, 2, 1_200_000],
      ["Shirt", "S", 2, 2_000_000],
    ]);
    expect(cart).toMatchObject({ subtotal: 3_200_000, removed: 3, shortOfStock: 1 });
  });
});

describe("placeOrder", () => {
  it("creates order #1001 with its lines, lowers the stock and opens with its link only", async () => {
    const { store, id } = await shop();

    const placed = await placeOrder(store, {
      cart: [{ productId: id("mug"), variantId: null, quantity: 2 }],
      checkout,
      locale: "es",
    });

    expect(placed.number).toBe(1001);
    const order = await getOrderByToken(store, placed.token);
    expect(order).toMatchObject({
      status: "pending_payment",
      total: 1_200_000,
      lines: [{ name: "Mug", quantity: 2, lineTotal: 1_200_000 }],
      payTo: { sinpe: { phone: "8888-1234", holder: "Tienda S.A." } },
    });
    const [mug] = await db
      .select({ stock: schema.product.stockQuantity, inStock: schema.product.inStock })
      .from(schema.product)
      .where(eq(schema.product.id, id("mug")));
    expect(mug).toEqual({ stock: 0, inStock: false });
    expect(await getOrderByToken(store, "not-the-token")).toBeUndefined();
  });

  it("numbers orders one after another", async () => {
    const { store, id, variant } = await shop();
    const cart = [{ productId: id("shirt"), variantId: variant("s"), quantity: 1 }];

    const first = await placeOrder(store, { cart, checkout, locale: "en" });
    const second = await placeOrder(store, { cart, checkout, locale: "en" });

    expect([first.number, second.number]).toEqual([1001, 1002]);
  });

  it("refuses a cart that changed, an empty one and a payment the store doesn't take", async () => {
    const { store, id } = await shop();
    const mug = (quantity: number) => [{ productId: id("mug"), variantId: null, quantity }];

    await expect(placeOrder(store, { cart: mug(3), checkout, locale: "en" })).rejects.toMatchObject(
      { code: "cart_changed" },
    );
    await expect(placeOrder(store, { cart: [], checkout, locale: "en" })).rejects.toMatchObject({
      code: "cart_empty",
    });
    await expect(
      placeOrder(store, {
        cart: mug(1),
        checkout: { ...checkout, paymentMethod: "transfer" },
        locale: "en",
      }),
    ).rejects.toMatchObject({ code: "payment_method_unavailable" });
  });

  it("never sells another store's product nor opens another store's order", async () => {
    const first = await shop();
    const second = await shop();
    const placed = await placeOrder(first.store, {
      cart: [{ productId: first.id("mug"), variantId: null, quantity: 1 }],
      checkout,
      locale: "en",
    });

    expect(
      (
        await priceCart(second.store, [
          { productId: first.id("mug"), variantId: null, quantity: 1 },
        ])
      ).lines,
    ).toEqual([]);
    expect(await getOrderByToken(second.store, placed.token)).toBeUndefined();
  });
});

describe("submitPaymentReference", () => {
  it("marks the payment as sent with its reference, and can be corrected", async () => {
    const { store, id } = await shop();
    const placed = await placeOrder(store, {
      cart: [{ productId: id("mug"), variantId: null, quantity: 1 }],
      checkout,
      locale: "en",
    });

    await submitPaymentReference(store, placed.token, "123");
    await submitPaymentReference(store, placed.token, "123456");

    expect(await getOrderByToken(store, placed.token)).toMatchObject({
      status: "payment_submitted",
      paymentReference: "123456",
    });
  });
});

describe("payments", () => {
  it("shows shoppers only the methods turned on, and only owners change them", async () => {
    const { store, owner } = await shop();

    expect(Object.keys(await getPaymentOptions(store))).toEqual(["sinpe"]);
    await expect(updateStorePayments({ ...owner, role: "member" }, {})).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});
