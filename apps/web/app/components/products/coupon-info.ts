import type { CouponRow } from "@monaztore/core";
import type { Locale } from "@monaztore/i18n";
import type { T } from "~/lib/i18n";
import { formatPrice } from "~/lib/money";

export type CouponState = "active" | "off" | "scheduled" | "expired" | "used_up";

/** Where a coupon stands today, as the list's label says it. */
export function couponState(
  coupon: Pick<CouponRow, "active" | "startsAt" | "endsAt" | "usageLimit" | "usedCount">,
  now: number,
): CouponState {
  if (!coupon.active) return "off";
  if (coupon.endsAt && new Date(coupon.endsAt).getTime() <= now) return "expired";
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) return "used_up";
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now) return "scheduled";
  return "active";
}

/** "10 % off" or "₡5 000 off". */
export function couponValue(
  t: T,
  coupon: Pick<CouponRow, "kind" | "amount">,
  currency: string,
  locale: Locale,
) {
  return coupon.kind === "percent"
    ? t("coupons.percentOff", { percent: coupon.amount })
    : t("coupons.amountOff", { amount: formatPrice(coupon.amount, currency, locale) });
}
