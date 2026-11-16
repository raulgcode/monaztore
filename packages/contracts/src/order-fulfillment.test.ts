import { describe, expect, it } from "vitest";
import { orderShippedSchema, whatsappLink } from "./order-fulfillment";

describe("whatsappLink", () => {
  it("adds Costa Rica's code to a number of 8 digits", () => {
    expect(whatsappLink("8888-0000")).toBe("https://wa.me/50688880000");
  });
  it("keeps a number that already has its country code", () => {
    expect(whatsappLink("+506 8888 0000")).toBe("https://wa.me/50688880000");
    expect(whatsappLink("+1 (305) 555-0100")).toBe("https://wa.me/13055550100");
  });
  it("gives nothing for what isn't a phone", () => {
    expect(whatsappLink("abc")).toBeNull();
  });
});

describe("orderShippedSchema", () => {
  it("takes an optional tracking number, trimmed", () => {
    expect(orderShippedSchema.parse({ trackingNumber: " CR123 " })).toEqual({
      trackingNumber: "CR123",
    });
    expect(orderShippedSchema.parse({})).toEqual({ trackingNumber: "" });
  });
});
