import { type CartLine, cartSchema } from "@monaztore/contracts";
import { createCookie } from "react-router";
import { env, secrets } from "./services.server";

/**
 * The cart lives in a cookie of the store's own domain (host-only), so each store has its own and
 * nothing is stored for someone who only looks. Signed so it can't be edited by hand; prices are
 * never in it: `priceCart` reads them from the database each time.
 */
const cartCookie = createCookie("cart", {
  path: "/",
  sameSite: "lax",
  httpOnly: true,
  secure: env.APP_URL.startsWith("https://"),
  maxAge: 60 * 60 * 24 * 30,
  secrets: [secrets.cookies],
});

export async function readCart(request: Request): Promise<CartLine[]> {
  const parsed = cartSchema.safeParse(await cartCookie.parse(request.headers.get("Cookie")));
  return parsed.success ? parsed.data : [];
}

export function cartCookieHeader(cart: CartLine[]): Promise<string> {
  return cartCookie.serialize(cart, cart.length === 0 ? { maxAge: 0 } : undefined);
}

/** How many items, for the header's cart button. */
export const cartCount = (cart: CartLine[]) => cart.reduce((sum, line) => sum + line.quantity, 0);

/**
 * The discount code the shopper typed, in its own cookie like the cart: host-only and signed.
 * Only the code: `priceCart` checks it against the store every time.
 */
const couponCookie = createCookie("coupon", {
  path: "/",
  sameSite: "lax",
  httpOnly: true,
  secure: env.APP_URL.startsWith("https://"),
  maxAge: 60 * 60 * 24 * 30,
  secrets: [secrets.cookies],
});

export async function readCoupon(request: Request): Promise<string | null> {
  const value = await couponCookie.parse(request.headers.get("Cookie"));
  return typeof value === "string" && value.length > 0 && value.length <= 32 ? value : null;
}

export function couponCookieHeader(code: string | null): Promise<string> {
  return couponCookie.serialize(code ?? "", code ? undefined : { maxAge: 0 });
}
