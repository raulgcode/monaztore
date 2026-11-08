import { describe, expect, it } from "vitest";
import {
  allocate,
  type CouponRules,
  couponDiscount,
  couponFormSchema,
  couponInputOf,
  discountedUnits,
  normalizeCouponCode,
} from "./coupons";

const rules = (overrides: Partial<CouponRules> = {}): CouponRules => ({
  code: "VERANO10",
  kind: "percent",
  amount: 10,
  startsAt: null,
  endsAt: null,
  usageLimit: null,
  usedCount: 0,
  minSubtotal: null,
  productIds: [],
  categoryIds: [],
  excludeSaleItems: false,
  active: true,
  ...overrides,
});

const now = new Date("2026-11-08T12:00:00Z");
const lines = [
  { productId: "a", categoryIds: ["kitchen"], lineTotal: 1_000_000, onSale: false },
  { productId: "b", categoryIds: [], lineTotal: 333_300, onSale: true },
];

describe("couponDiscount", () => {
  it("takes a percentage off every line it covers, rounding down", () => {
    expect(couponDiscount(rules(), lines, now)).toEqual({
      ok: true,
      discount: 133_330,
      perLine: [100_000, 33_330],
    });
  });

  it("takes an amount off once, never more than the lines cost", () => {
    expect(
      couponDiscount(rules({ kind: "fixed", amount: 50_000_000, productIds: ["b"] }), lines, now),
    ).toEqual({
      ok: true,
      discount: 333_300,
      perLine: [0, 333_300],
    });
  });

  it("covers only its collections and, if it says so, skips products on offer", () => {
    expect(couponDiscount(rules({ categoryIds: ["kitchen"] }), lines, now)).toMatchObject({
      perLine: [100_000, 0],
    });
    expect(
      couponDiscount(rules({ excludeSaleItems: true, productIds: ["b"] }), lines, now),
    ).toEqual({
      ok: false,
      problem: "no_eligible",
    });
  });

  it("says why it doesn't apply", () => {
    const problem = (overrides: Partial<CouponRules>) => {
      const result = couponDiscount(rules(overrides), lines, now);
      return result.ok ? null : result.problem;
    };
    expect(problem({ active: false })).toBe("inactive");
    expect(problem({ startsAt: new Date("2026-11-09T00:00:00Z") })).toBe("not_started");
    expect(problem({ endsAt: now })).toBe("expired");
    expect(problem({ usageLimit: 3, usedCount: 3 })).toBe("used_up");
    expect(problem({ minSubtotal: 2_000_000 })).toBe("min_subtotal");
  });
});

describe("allocate", () => {
  it("splits in proportion and adds up exactly", () => {
    const shares = allocate(100, [1, 1, 1]);
    expect(shares).toEqual([34, 33, 33]);
    expect(allocate(7, [0, 5, 5])).toEqual([0, 4, 3]);
    expect(allocate(0, [3, 4])).toEqual([0, 0]);
  });
});

describe("discountedUnits", () => {
  it("lowers the unit price, with one unit carrying what doesn't divide", () => {
    expect(discountedUnits({ quantity: 2, lineTotal: 2_000_000, discount: 0 })).toEqual([
      { quantity: 2, unitPrice: 1_000_000 },
    ]);
    expect(discountedUnits({ quantity: 3, lineTotal: 3_000, discount: 1_000 })).toEqual([
      { quantity: 2, unitPrice: 666 },
      { quantity: 1, unitPrice: 668 },
    ]);
    expect(discountedUnits({ quantity: 1, lineTotal: 1_000, discount: 1 })).toEqual([
      { quantity: 1, unitPrice: 999 },
    ]);
  });
});

describe("couponFormSchema", () => {
  const form = (fields: Record<string, string | string[]>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      for (const one of [value].flat()) data.append(key, one);
    }
    return couponFormSchema.safeParse(
      Object.fromEntries(
        [...new Set(data.keys())].map((k) => [
          k,
          data.getAll(k).length > 1 ? data.getAll(k) : data.get(k),
        ]),
      ),
    );
  };

  it("reads a code as people type it and the dates in the owner's time zone", () => {
    const parsed = form({
      code: " verano 10",
      kind: "percent",
      amount: "15",
      startsOn: "2026-12-01",
      endsOn: "2026-12-31",
      timeZone: "America/Costa_Rica",
      active: "on",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(couponInputOf(parsed.data)).toMatchObject({
      code: "VERANO10",
      amount: 15,
      startsAt: new Date("2026-12-01T06:00:00Z"),
      endsAt: new Date("2027-01-01T06:00:00Z"),
      active: true,
    });
    expect(normalizeCouponCode("ab c")).toBe("ABC");
  });

  it("refuses a percentage over 100 and a scope with nothing picked", () => {
    expect(form({ code: "X10", kind: "percent", amount: "120" }).success).toBe(false);
    expect(form({ code: "X10", kind: "fixed", amount: "5000", appliesTo: "some" }).success).toBe(
      false,
    );
    const fixed = form({ code: "X10", kind: "fixed", amount: "5 000" });
    expect(fixed.success && couponInputOf(fixed.data).amount).toBe(500_000);
  });
});
