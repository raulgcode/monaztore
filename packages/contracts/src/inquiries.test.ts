import { describe, expect, it } from "vitest";
import { inquirySchema, linkCount, readInquiryStatus } from "./inquiries";

const valid = {
  blockId: "request",
  name: "Ana",
  email: "ana@example.com",
  phone: "8888 0000",
  message: "Quiero medias con la cara de mi perro",
};

describe("inquirySchema", () => {
  it("takes a request with an optional phone", () => {
    expect(inquirySchema.safeParse(valid).success).toBe(true);
    expect(inquirySchema.safeParse({ ...valid, phone: undefined }).success).toBe(true);
  });

  it("refuses a message without words or with too many links", () => {
    expect(inquirySchema.safeParse({ ...valid, message: "  " }).success).toBe(false);
    expect(
      inquirySchema.safeParse({
        ...valid,
        message: "http://a.com http://b.com https://c.com",
      }).success,
    ).toBe(false);
  });

  it("refuses an email or phone that aren't one", () => {
    expect(inquirySchema.safeParse({ ...valid, email: "ana" }).success).toBe(false);
    expect(inquirySchema.safeParse({ ...valid, phone: "llámame" }).success).toBe(false);
  });
});

describe("linkCount", () => {
  it("counts web addresses, with or without the scheme", () => {
    expect(linkCount("mira www.spam.com y https://x.io")).toBe(2);
    expect(linkCount("sin enlaces")).toBe(0);
  });
});

describe("readInquiryStatus", () => {
  it("reads done and all, and anything else is the ones to answer", () => {
    expect(readInquiryStatus("done")).toBe("done");
    expect(readInquiryStatus("all")).toBe("all");
    expect(readInquiryStatus("x")).toBe("new");
    expect(readInquiryStatus(null)).toBe("new");
  });
});
