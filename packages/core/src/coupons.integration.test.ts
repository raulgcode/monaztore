import type { CheckoutInput, CouponInput, ProductInput } from "@monaztore/contracts";
import { createTestDatabase, createTestTenant } from "@monaztore/db/testing";
import { afterAll, describe, expect, it } from "vitest";
import { deleteCoupon, getCoupon, listCoupons, saveCoupon, setCouponActive } from "./coupons";
import { getOrderByToken, placeOrder, priceCart, updateStorePayments } from "./orders";
import { createCategory, saveProduct } from "./products";
import { cancelOrder } from "./store-admin";
import type { StorefrontContext } from "./storefront";
import type { TenantContext } from "./tenant";
import { resolveTenant } from "./workspaces";

const connection = createTestDatabase();
afterAll(() => connection.close());
const db = connection.db;

const product = (overrides: Partial<ProductInput>): ProductInput => ({
  name: "Taza",
  slug: "",
  status: "active",
  description: "",
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

const coupon = (overrides: Partial<CouponInput> = {}): CouponInput => ({
  code: "VERANO10",
  note: "",
  kind: "percent",
  amount: 10,
  startsAt: null,
  endsAt: null,
  usageLimit: null,
  usageLimitPerCustomer: null,
  minSubtotal: null,
  productIds: [],
  categoryIds: [],
  excludeSaleItems: false,
  active: true,
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

/** A store with a mug (₡10 000) and a plate on offer (₡6 000, was ₡8 000), taking SINPE. */
async function shop() {
  const tenant = await createTestTenant(db);
  const owner = (await resolveTenant(db, tenant.userId, tenant.slug)) as TenantContext;
  const kitchen = await createCategory(owner, { name: "Cocina" });
  const mug = await saveProduct(owner, null, product({ name: "Taza", categoryIds: [kitchen.id] }));
  const plate = await saveProduct(
    owner,
    null,
    product({ name: "Plato", price: 600_000, compareAtPrice: 800_000 }),
  );
  await updateStorePayments(owner, {
    sinpe: { enabled: true, phone: "8888-1234", holder: "Tienda" },
  });
  const store: StorefrontContext = {
    db,
    store: {
      organizationId: tenant.organizationId,
      name: "Tienda",
      slug: tenant.slug,
      hostname: "t.test",
    },
  };
  const cart = [
    { productId: mug, variantId: null, quantity: 2 },
    { productId: plate, variantId: null, quantity: 1 },
  ];
  return { owner, store, mug, plate, kitchen, cart };
}

describe("coupons in the cart", () => {
  it("takes a percentage off the whole cart, whatever case the shopper types", async () => {
    const { owner, store, cart } = await shop();
    await saveCoupon(owner, null, coupon());
    const priced = await priceCart(store, cart, { couponCode: " verano10 " });
    expect(priced).toMatchObject({
      subtotal: 2_600_000,
      discount: 260_000,
      total: 2_340_000,
      coupon: { code: "VERANO10", kind: "percent", amount: 10 },
      couponProblem: null,
    });
    expect(priced.lines.map((l) => l.discount)).toEqual([200_000, 60_000]);
  });

  it("only on its collections, and never on products already on offer if it says so", async () => {
    const { owner, store, cart, kitchen } = await shop();
    await saveCoupon(
      owner,
      null,
      coupon({ kind: "fixed", amount: 500_000, categoryIds: [kitchen.id] }),
    );
    expect(await priceCart(store, cart, { couponCode: "VERANO10" })).toMatchObject({
      discount: 500_000,
    });

    await saveCoupon(owner, null, coupon({ code: "NOOFFER", amount: 50, excludeSaleItems: true }));
    const priced = await priceCart(store, cart, { couponCode: "NOOFFER" });
    expect(priced.lines.map((l) => l.discount)).toEqual([1_000_000, 0]);
  });

  it("says why a code doesn't apply", async () => {
    const { owner, store, cart } = await shop();
    await saveCoupon(owner, null, coupon({ code: "MIN50", minSubtotal: 5_000_000 }));
    await saveCoupon(owner, null, coupon({ code: "OLD", endsAt: new Date(Date.now() - 1000) }));
    await saveCoupon(owner, null, coupon({ code: "OFF", active: false }));
    const problem = async (code: string) =>
      (await priceCart(store, cart, { couponCode: code })).couponProblem;
    expect(await problem("MIN50")).toBe("min_subtotal");
    expect(await problem("OLD")).toBe("expired");
    expect(await problem("OFF")).toBe("inactive");
    expect(await problem("NOPE")).toBe("not_found");
  });

  it("never applies another store's code", async () => {
    const { store, cart } = await shop();
    const other = await shop();
    await saveCoupon(other.owner, null, coupon({ code: "AJENO" }));
    expect((await priceCart(store, cart, { couponCode: "AJENO" })).couponProblem).toBe("not_found");
    expect(await listCoupons((await shop()).owner)).toEqual([]);
  });
});

describe("coupons in the order", () => {
  it("keeps the discount, counts the use and gives it back when the order is cancelled", async () => {
    const { owner, store, cart } = await shop();
    const id = await saveCoupon(owner, null, coupon({ usageLimit: 1 }));
    const placed = await placeOrder(store, {
      cart,
      checkout,
      locale: "es",
      couponCode: "verano10",
    });
    const order = await getOrderByToken(store, placed.token);
    expect(order).toMatchObject({
      subtotal: 2_600_000,
      discount: 260_000,
      total: 2_340_000,
      couponCode: "VERANO10",
    });
    expect((await getCoupon(owner, id))?.usedCount).toBe(1);

    // Its one use is gone: the next shopper can't.
    await expect(
      placeOrder(store, {
        cart,
        checkout: { ...checkout, email: "luis@example.com" },
        locale: "es",
        couponCode: "VERANO10",
      }),
    ).rejects.toMatchObject({ code: "coupon_invalid" });

    await cancelOrder(owner, placed.number);
    expect((await getCoupon(owner, id))?.usedCount).toBe(0);
  });

  it("stops at the uses per email", async () => {
    const { owner, store, cart } = await shop();
    await saveCoupon(owner, null, coupon({ usageLimitPerCustomer: 1 }));
    await placeOrder(store, { cart, checkout, locale: "es", couponCode: "VERANO10" });
    await expect(
      placeOrder(store, { cart, checkout, locale: "es", couponCode: "VERANO10" }),
    ).rejects.toMatchObject({
      code: "coupon_used",
    });
  });

  it("keeps the code on the order when the coupon is deleted", async () => {
    const { owner, store, cart } = await shop();
    const id = await saveCoupon(owner, null, coupon());
    const placed = await placeOrder(store, {
      cart,
      checkout,
      locale: "es",
      couponCode: "VERANO10",
    });
    await deleteCoupon(owner, id);
    expect(await getOrderByToken(store, placed.token)).toMatchObject({
      couponCode: "VERANO10",
      discount: 260_000,
    });
  });
});

describe("saveCoupon", () => {
  it("refuses a code the store already has, and lets only owners manage coupons", async () => {
    const { owner } = await shop();
    const id = await saveCoupon(owner, null, coupon());
    await expect(saveCoupon(owner, null, coupon({ code: "verano10" }))).rejects.toMatchObject({
      code: "code_taken",
    });
    await setCouponActive(owner, id, false);
    expect((await getCoupon(owner, id))?.active).toBe(false);
    await expect(
      saveCoupon({ ...owner, role: "member" }, null, coupon({ code: "OTRO" })),
    ).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("keeps only the store's own products in a coupon", async () => {
    const { owner, mug } = await shop();
    const other = await shop();
    const id = await saveCoupon(owner, null, coupon({ productIds: [mug, other.mug] }));
    expect((await getCoupon(owner, id))?.productIds).toEqual([mug]);
  });
});
