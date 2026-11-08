import { describe, expect, it } from "vitest";
import { decimalPrice, formatPrice } from "./money";

describe("formatPrice", () => {
  it("drops decimals on whole amounts and uses the sign on price tags", () => {
    expect(formatPrice(1_250_000, "CRC", "en")).toBe("₡12,500");
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
