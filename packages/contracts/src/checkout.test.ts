import { describe, expect, it } from "vitest";
import { addToCart, CART_LINE_MAX, checkoutSchema, setCartQuantity } from "./checkout";

const mug = "6f8b1f0e-0000-4000-8000-000000000001";
const small = "6f8b1f0e-0000-4000-8000-000000000002";

describe("addToCart", () => {
  it("adds to the same line instead of repeating it, and caps the quantity", () => {
    let cart = addToCart([], { productId: mug, quantity: 2 });
    cart = addToCart(cart, { productId: mug, quantity: 3 });
    expect(cart).toEqual([{ productId: mug, variantId: null, quantity: 5 }]);
    expect(addToCart(cart, { productId: mug, quantity: CART_LINE_MAX })[0]?.quantity).toBe(
      CART_LINE_MAX,
    );
  });
  it("keeps each variant on its own line", () => {
    const cart = addToCart(addToCart([], { productId: mug, quantity: 1 }), {
      productId: mug,
      variantId: small,
      quantity: 1,
    });
    expect(cart).toHaveLength(2);
  });
});

describe("setCartQuantity", () => {
  it("changes the quantity, and zero takes the line out", () => {
    const cart = addToCart([], { productId: mug, quantity: 1 });
    const line = { productId: mug, variantId: null };
    expect(setCartQuantity(cart, line, 4)[0]?.quantity).toBe(4);
    expect(setCartQuantity(cart, line, 0)).toEqual([]);
  });
});

describe("checkoutSchema", () => {
  const valid = {
    email: " Ana@Example.com ",
    name: "Ana Mora",
    phone: "+506 8888-0000",
    line1: "100 m norte del parque",
    city: "Heredia",
    province: "Heredia",
    paymentMethod: "sinpe",
  };
  it("accepts a complete order and lowercases the email", () => {
    const result = checkoutSchema.safeParse(valid);
    expect(result.success && result.data).toMatchObject({ email: "ana@example.com", notes: "" });
  });
  it("says which field is wrong with a translation key", () => {
    const result = checkoutSchema.safeParse({ ...valid, phone: "abc", paymentMethod: "cash" });
    expect(result.success).toBe(false);
    const messages = result.error?.issues.map((issue) => issue.message);
    expect(messages).toEqual(
      expect.arrayContaining(["forms.phoneInvalid", "forms.paymentMethodRequired"]),
    );
  });
});
