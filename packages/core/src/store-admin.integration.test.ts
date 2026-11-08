import { randomUUID } from "node:crypto";
import type { CheckoutInput } from "@monaztore/contracts";
import { eq, schema } from "@monaztore/db";
import { createTestDatabase, createTestTenant } from "@monaztore/db/testing";
import { afterAll, describe, expect, it } from "vitest";
import { importCatalog, listImportedProducts } from "./catalog-import";
import { placeOrder, submitPaymentReference, updateStorePayments } from "./orders";
import {
  cancelOrder,
  countOrdersToReview,
  getOrder,
  listOrders,
  listStoreDomains,
  markOrderPaid,
  removeStoreDomain,
  setPrimaryDomain,
} from "./store-admin";
import type { StorefrontContext } from "./storefront";
import { addStoreDomain } from "./stores";
import type { TenantContext } from "./tenant";
import { resolveTenant } from "./workspaces";

const connection = createTestDatabase();
afterAll(() => connection.close());
const db = connection.db;

const checkout: CheckoutInput = {
  email: "ana@example.com",
  name: "Ana Mora",
  phone: "8888-0000",
  line1: "Del parque 100 m norte",
  city: "Heredia",
  province: "Heredia",
  notes: "",
  paymentMethod: "sinpe",
};

/** A store with a mug (3 in stock) that takes SINPE, and one order of 2 mugs. */
async function storeWithOrder() {
  const tenant = await createTestTenant(db);
  const owner = (await resolveTenant(db, tenant.userId, tenant.slug)) as TenantContext;
  await importCatalog(owner, {
    source: "woocommerce",
    sourceUrl: "https://shop.example",
    currency: "CRC",
    categories: [],
    products: [
      {
        externalId: "mug",
        slug: "mug",
        name: "Mug",
        description: "",
        shortDescription: "",
        status: "active",
        sku: null,
        price: 500_000,
        compareAtPrice: null,
        stockQuantity: 3,
        inStock: true,
        weightGrams: null,
        seoTitle: null,
        seoDescription: null,
        categoryExternalIds: [],
        images: [],
        options: [],
        variants: [],
        oldPath: null,
      },
    ],
    customers: [],
    warnings: [],
  });
  await updateStorePayments(owner, { sinpe: { enabled: true, phone: "8888", holder: "T" } });
  const [mug] = await listImportedProducts(owner, "woocommerce");
  const store: StorefrontContext = {
    db,
    store: { organizationId: tenant.organizationId, name: "T", slug: tenant.slug, hostname: "t" },
  };
  const placed = await placeOrder(store, {
    cart: [{ productId: mug?.id as string, variantId: null, quantity: 2 }],
    checkout,
    locale: "es",
  });
  const stock = async () =>
    (
      await db
        .select({ stock: schema.product.stockQuantity })
        .from(schema.product)
        .where(eq(schema.product.id, mug?.id as string))
    )[0]?.stock;
  return { owner, store, placed, stock };
}

describe("orders in the workspace", () => {
  it("lists them, counts the payments to check and shows one without its link's secret", async () => {
    const { owner, store, placed } = await storeWithOrder();
    await submitPaymentReference(store, placed.token, "998877");

    const list = await listOrders(owner);
    expect(list.orders).toMatchObject([
      { number: 1001, status: "payment_submitted", total: 1_000_000 },
    ]);
    expect(await countOrdersToReview(owner)).toBe(1);
    expect((await listOrders(owner, { status: "paid" })).total).toBe(0);

    const order = await getOrder(owner, 1001);
    expect(order).toMatchObject({
      paymentReference: "998877",
      lines: [{ name: "Mug", quantity: 2 }],
    });
    expect(order).not.toHaveProperty("tokenHash");
  });

  it("marking it paid adds to what the customer bought, once", async () => {
    const { owner } = await storeWithOrder();

    await markOrderPaid(owner, 1001);

    expect((await getOrder(owner, 1001))?.status).toBe("paid");
    const [customer] = await db
      .select({ orders: schema.customer.ordersCount, spent: schema.customer.totalSpent })
      .from(schema.customer)
      .where(eq(schema.customer.organizationId, owner.organizationId));
    expect(customer).toEqual({ orders: 1, spent: 1_000_000 });
    await expect(markOrderPaid(owner, 1001)).rejects.toMatchObject({ code: "order_closed" });
  });

  it("cancelling puts the stock back, and a paid order can't be cancelled", async () => {
    const { owner, stock } = await storeWithOrder();
    expect(await stock()).toBe(1);

    await cancelOrder(owner, 1001);

    expect(await stock()).toBe(3);
    expect((await getOrder(owner, 1001))?.status).toBe("cancelled");
    await expect(cancelOrder(owner, 1001)).rejects.toMatchObject({ code: "order_closed" });
  });

  it("another workspace never sees nor touches the order", async () => {
    await storeWithOrder();
    const other = await createTestTenant(db);
    const ctx = (await resolveTenant(db, other.userId, other.slug)) as TenantContext;

    expect((await listOrders(ctx)).total).toBe(0);
    expect(await getOrder(ctx, 1001)).toBeUndefined();
    await expect(markOrderPaid(ctx, 1001)).rejects.toMatchObject({ code: "order_closed" });
  });
});

describe("domains in the workspace", () => {
  it("moves the primary domain and disconnects one", async () => {
    const { owner } = await storeWithOrder();
    const a = `a-${randomUUID().slice(0, 8)}.test`;
    const b = `b-${randomUUID().slice(0, 8)}.test`;
    await addStoreDomain(owner, a, { primary: true });
    await addStoreDomain(owner, b);

    await setPrimaryDomain(owner, b);
    expect(await listStoreDomains(owner)).toEqual([
      { hostname: b, primary: true },
      { hostname: a, primary: false },
    ]);

    await removeStoreDomain(owner, a);
    expect(await listStoreDomains(owner)).toEqual([{ hostname: b, primary: true }]);
    await expect(setPrimaryDomain({ ...owner, role: "member" }, b)).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});
