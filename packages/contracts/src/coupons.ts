import { z } from "zod/mini";
import { priceToMinor } from "./digital-products";
import { message } from "./message";
import { dayStart, safeTimeZone } from "./products";

// Discount codes: the store makes them in the workspace (Coupons) and shoppers type them in the
// cart. What a code takes off is decided here, without I/O, so the cart, the checkout and the
// order count the same.

export const couponKinds = ["percent", "fixed"] as const;
export type CouponKindName = (typeof couponKinds)[number];

export const COUPON_CODE_MAX = 32;
export const COUPON_PRODUCTS_MAX = 100;

/** "  verano 10 " → "VERANO10": codes ignore case and spaces, the way people type them. */
export function normalizeCouponCode(code: string): string {
  return code.replace(/\s+/g, "").toUpperCase().slice(0, COUPON_CODE_MAX);
}

export const couponCodePattern = /^[A-Z0-9_-]{3,32}$/;

/** What the shopper types in the cart. */
export const applyCouponSchema = z.object({
  code: z.pipe(
    z
      .string({ error: message("forms.couponRequired") })
      .check(z.minLength(1, message("forms.couponRequired"))),
    z.transform(normalizeCouponCode),
  ),
});

/** What decides a coupon; the row of `coupon` has all of it. */
export interface CouponRules {
  code: string;
  kind: CouponKindName;
  /** percent: 1–100; fixed: minor units. */
  amount: number;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  usedCount: number;
  minSubtotal: number | null;
  productIds: string[];
  categoryIds: string[];
  excludeSaleItems: boolean;
  active: boolean;
}

/** A cart line as the coupon sees it. */
export interface DiscountLine {
  productId: string;
  categoryIds: readonly string[];
  lineTotal: number;
  /** The product is already on offer right now. */
  onSale: boolean;
}

export type CouponProblem =
  | "inactive"
  | "not_started"
  | "expired"
  | "used_up"
  | "min_subtotal"
  | "no_eligible";

export type CouponResult =
  | { ok: true; discount: number; perLine: number[] }
  | { ok: false; problem: CouponProblem };

/**
 * Splits `total` across `weights` in proportion, in whole minor units that add up exactly: the
 * units left by rounding down go to the biggest remainders first.
 */
export function allocate(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const exact = weights.map((weight) => (total * weight) / sum);
  const shares = exact.map(Math.floor);
  let left = total - shares.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    if ((weights[index] ?? 0) <= 0) continue;
    shares[index] = (shares[index] ?? 0) + 1;
    left--;
  }
  return shares;
}

/** Whether a line gets the coupon: its product or collections, and not already on offer if so. */
export function lineQualifies(coupon: CouponRules, line: DiscountLine): boolean {
  if (coupon.excludeSaleItems && line.onSale) return false;
  if (coupon.productIds.length === 0 && coupon.categoryIds.length === 0) return true;
  return (
    coupon.productIds.includes(line.productId) ||
    line.categoryIds.some((id) => coupon.categoryIds.includes(id))
  );
}

/**
 * What a coupon takes off a cart now, and each line's share (for the invoice). A percentage
 * applies to the lines it covers; an amount comes off once, never more than those lines cost.
 * The limit per shopper needs their email: the checkout checks it.
 */
export function couponDiscount(
  coupon: CouponRules,
  lines: readonly DiscountLine[],
  now: Date,
): CouponResult {
  if (!coupon.active) return { ok: false, problem: "inactive" };
  if (coupon.startsAt && coupon.startsAt.getTime() > now.getTime()) {
    return { ok: false, problem: "not_started" };
  }
  if (coupon.endsAt && coupon.endsAt.getTime() <= now.getTime()) {
    return { ok: false, problem: "expired" };
  }
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    return { ok: false, problem: "used_up" };
  }
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  if (coupon.minSubtotal !== null && subtotal < coupon.minSubtotal) {
    return { ok: false, problem: "min_subtotal" };
  }
  const weights = lines.map((line) => (lineQualifies(coupon, line) ? line.lineTotal : 0));
  const eligible = weights.reduce((a, b) => a + b, 0);
  if (eligible <= 0) return { ok: false, problem: "no_eligible" };
  const discount =
    coupon.kind === "percent"
      ? Math.floor((eligible * Math.min(100, Math.max(0, coupon.amount))) / 100)
      : Math.min(coupon.amount, eligible);
  return { ok: true, discount, perLine: allocate(discount, weights) };
}

/**
 * An order line with its share of a coupon, as invoice lines that add up to exactly what was
 * paid: the same price for every unit when it divides, else one unit carries the remainder.
 */
export function discountedUnits(line: {
  quantity: number;
  lineTotal: number;
  discount: number;
}): { quantity: number; unitPrice: number }[] {
  if (line.discount <= 0)
    return [{ quantity: line.quantity, unitPrice: line.lineTotal / line.quantity }];
  const net = line.lineTotal - line.discount;
  const base = Math.floor(net / line.quantity);
  const rest = net - base * line.quantity;
  if (rest === 0) return [{ quantity: line.quantity, unitPrice: base }];
  const units = [{ quantity: 1, unitPrice: base + rest }];
  if (line.quantity > 1) units.unshift({ quantity: line.quantity - 1, unitPrice: base });
  return units;
}

const count = (key: Parameters<typeof message>[0]) =>
  z.pipe(
    z._default(
      z.string().check(
        z.trim(),
        z.refine(
          (value) => value === "" || (/^\d{1,6}$/.test(value) && Number(value) >= 1),
          message(key),
        ),
      ),
      "",
    ),
    z.transform((value) => (value === "" ? null : Number(value))),
  );

const day = z._default(
  z.string().check(
    z.trim(),
    z.refine(
      (value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value),
      message("forms.dateInvalid"),
    ),
  ),
  "",
);

/** The coupon editor's form. */
export const couponFormSchema = z
  .object({
    code: z.pipe(
      z
        .string({ error: message("forms.couponCodeInvalid") })
        .check(
          z.refine(
            (value) => couponCodePattern.test(normalizeCouponCode(value)),
            message("forms.couponCodeInvalid"),
          ),
        ),
      z.transform(normalizeCouponCode),
    ),
    note: z._default(
      z.string().check(z.trim(), z.maxLength(200, message("forms.textTooLong"))),
      "",
    ),
    kind: z._default(z.enum(couponKinds), "percent"),
    amount: z
      .string({ error: message("forms.couponAmountInvalid") })
      .check(z.trim(), z.minLength(1, message("forms.couponAmountInvalid"))),
    startsOn: day,
    endsOn: day,
    timeZone: z._default(z.string().check(z.maxLength(64)), ""),
    usageLimit: count("forms.couponLimitInvalid"),
    usageLimitPerCustomer: count("forms.couponLimitInvalid"),
    minSubtotal: z._default(
      z.string().check(
        z.trim(),
        z.refine(
          (value) => value === "" || (priceToMinor(value) ?? 0) > 0,
          message("forms.priceInvalid"),
        ),
      ),
      "",
    ),
    appliesTo: z._default(z.enum(["all", "some"]), "all"),
    productIds: z._default(z.array(z.uuid()).check(z.maxLength(COUPON_PRODUCTS_MAX)), []),
    categoryIds: z._default(z.array(z.uuid()).check(z.maxLength(COUPON_PRODUCTS_MAX)), []),
    excludeSaleItems: z.pipe(
      z._default(z.string(), ""),
      z.transform((value) => value === "on"),
    ),
    active: z.pipe(
      z._default(z.string(), ""),
      z.transform((value) => value === "on"),
    ),
  })
  .check(
    z.refine(
      (form) => {
        if (form.kind === "percent") {
          return (
            /^\d{1,3}$/.test(form.amount) && Number(form.amount) >= 1 && Number(form.amount) <= 100
          );
        }
        return (priceToMinor(form.amount) ?? 0) > 0;
      },
      { message: message("forms.couponAmountInvalid"), path: ["amount"] },
    ),
    z.refine((form) => form.startsOn === "" || form.endsOn === "" || form.startsOn <= form.endsOn, {
      message: message("forms.saleDatesOrder"),
      path: ["endsOn"],
    }),
    z.refine(
      (form) => form.appliesTo === "all" || form.productIds.length + form.categoryIds.length > 0,
      {
        message: message("forms.couponScopeRequired"),
        path: ["productIds"],
      },
    ),
  );
export type CouponForm = z.infer<typeof couponFormSchema>;

/** What core saves from the form. Pure. */
export function couponInputOf(form: CouponForm) {
  const zone = safeTimeZone(form.timeZone);
  const some = form.appliesTo === "some";
  return {
    code: form.code,
    note: form.note,
    kind: form.kind,
    amount: form.kind === "percent" ? Number(form.amount) : (priceToMinor(form.amount) ?? 0),
    startsAt: form.startsOn ? dayStart(form.startsOn, zone) : null,
    endsAt: form.endsOn ? dayStart(form.endsOn, zone, { endOfDay: true }) : null,
    usageLimit: form.usageLimit,
    usageLimitPerCustomer: form.usageLimitPerCustomer,
    minSubtotal: form.minSubtotal ? priceToMinor(form.minSubtotal) : null,
    productIds: some ? [...new Set(form.productIds)] : [],
    categoryIds: some ? [...new Set(form.categoryIds)] : [],
    excludeSaleItems: form.excludeSaleItems,
    active: form.active,
  };
}
export type CouponInput = ReturnType<typeof couponInputOf>;
