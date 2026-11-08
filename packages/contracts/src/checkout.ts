import { z } from "zod/mini";
import { message } from "./message";

/** Most a single line of the cart can ask for: enough for a shop, not for a script. */
export const CART_LINE_MAX = 99;
/** Different products in one cart. */
export const CART_LINES_MAX = 50;

export const paymentMethods = ["sinpe", "transfer"] as const;
export type CheckoutPaymentMethod = (typeof paymentMethods)[number];

const text = (required: Parameters<typeof message>[0], max: number) =>
  z
    .string({ error: message(required) })
    .check(
      z.trim(),
      z.minLength(1, message(required)),
      z.maxLength(max, message("forms.textTooLong")),
    );

/** What "Add to cart" sends: the product, the variant when it has options, and how many. */
export const addToCartSchema = z.object({
  productId: z.uuid(),
  variantId: z.optional(z.uuid()),
  quantity: z._default(z.coerce.number().check(z.int(), z.minimum(1), z.maximum(CART_LINE_MAX)), 1),
});
export type AddToCartInput = z.infer<typeof addToCartSchema>;

/** One line of the cart as it lives in its cookie. */
export const cartLineSchema = z.object({
  productId: z.uuid(),
  variantId: z.nullable(z.uuid()),
  quantity: z.number().check(z.int(), z.minimum(1), z.maximum(CART_LINE_MAX)),
});
export type CartLine = z.infer<typeof cartLineSchema>;

export const cartSchema = z.array(cartLineSchema).check(z.maxLength(CART_LINES_MAX));

/** Adds to the line of the same product and variant, or a new line, without going over the max. */
export function addToCart(cart: CartLine[], item: AddToCartInput): CartLine[] {
  const variantId = item.variantId ?? null;
  const existing = cart.find((l) => l.productId === item.productId && l.variantId === variantId);
  if (existing) {
    return cart.map((line) =>
      line === existing
        ? { ...line, quantity: Math.min(CART_LINE_MAX, line.quantity + item.quantity) }
        : line,
    );
  }
  if (cart.length >= CART_LINES_MAX) return cart;
  return [...cart, { productId: item.productId, variantId, quantity: item.quantity }];
}

/** Sets a line's quantity; 0 takes it out. */
export function setCartQuantity(
  cart: CartLine[],
  line: Pick<CartLine, "productId" | "variantId">,
  quantity: number,
): CartLine[] {
  const same = (l: CartLine) => l.productId === line.productId && l.variantId === line.variantId;
  if (quantity <= 0) return cart.filter((l) => !same(l));
  return cart.map((l) => (same(l) ? { ...l, quantity: Math.min(CART_LINE_MAX, quantity) } : l));
}

const email = z.pipe(
  z.string({ error: message("forms.emailRequired") }).check(z.trim(), z.toLowerCase()),
  z.email({ error: message("forms.emailInvalid") }),
);

const contactFields = {
  email,
  name: text("forms.nameRequired", 80),
  phone: z
    .string({ error: message("forms.phoneRequired") })
    .check(
      z.trim(),
      z.minLength(1, message("forms.phoneRequired")),
      z.regex(/^\+?[\d\s()-]{7,20}$/, message("forms.phoneInvalid")),
    ),
  notes: z._default(z.string().check(z.trim(), z.maxLength(500, message("forms.textTooLong"))), ""),
  paymentMethod: z.enum(paymentMethods, { error: message("forms.paymentMethodRequired") }),
};

/** The checkout form: who buys, where it goes and how they pay. */
export const checkoutSchema = z.object({
  ...contactFields,
  line1: text("forms.addressRequired", 200),
  city: text("forms.cityRequired", 80),
  province: text("forms.provinceRequired", 80),
});

const noAddress = z._default(z.literal(""), "");

/**
 * The checkout of a cart with only digital downloads: nothing to ship, so no address. The
 * values have the same shape, with the address empty.
 */
export const digitalCheckoutSchema = z.object({
  ...contactFields,
  line1: noAddress,
  city: noAddress,
  province: noAddress,
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** The shopper tells the store which payment is theirs. */
export const paymentReferenceSchema = z.object({
  reference: text("forms.referenceRequired", 80),
});
