import { describe, expect, it } from "vitest";
import { decimalPrice, formatPrice, percentOff } from "./money";

describe("formatPrice", () => {
  it("drops decimals on whole amounts and uses the sign on price tags", () => {
    expect(formatPrice(1_250_000, "CRC", "en")).toBe("₡12,500");
  });
  it("writes colones the way Costa Rica does, sign first, in Spanish too", () => {
    expect(formatPrice(320_000, "CRC", "es").replace(/\s/g, " ")).toBe("₡3 200");
  });
  it("keeps the cents when there are some", () => {
    expect(formatPrice(599_050, "USD", "en")).toBe("$5,990.50");
  });
});

describe("decimalPrice", () => {
  it("writes two digits", () => {
    expect(decimalPrice(1_250_000)).toBe("12500.00");
    expect(decimalPrice(7)).toBe("0.07");
  });
});

describe("percentOff", () => {
  it("rounds what is taken off down, so a card never promises more than it gives", () => {
    expect(percentOff(390_000, 490_000)).toBe(20);
    expect(percentOff(480_000, 560_000)).toBe(14);
  });
  it("is nothing without a higher regular price, or when it would round to 0 %", () => {
    expect(percentOff(390_000, null)).toBeNull();
    expect(percentOff(390_000, 390_000)).toBeNull();
    expect(percentOff(null, 390_000)).toBeNull();
    expect(percentOff(999, 1_000)).toBeNull();
  });
});
