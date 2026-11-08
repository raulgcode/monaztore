import { describe, expect, it } from "vitest";
import { digitalCheckoutSchema } from "./checkout";
import {
  DIGITAL_FILE_MAX_BYTES,
  downloadFileName,
  downloadRulesSchema,
  formatFileSize,
  minorToPrice,
  newDigitalProductSchema,
  priceToMinor,
} from "./digital-products";

describe("priceToMinor", () => {
  it.each([
    ["5000", 500_000],
    ["5 000", 500_000],
    ["5.000", 500_000],
    ["1,250,000", 125_000_000],
    ["12.50", 1250],
    ["12,5", 1250],
    [" 7 ", 700],
  ])("reads %s as %i", (text, minor) => {
    expect(priceToMinor(text)).toBe(minor);
  });

  it.each(["", "abc", "-5", "12.5055", "5..0", "₡5000"])("refuses %s", (text) => {
    expect(priceToMinor(text)).toBeNull();
  });

  it("writes a saved price back the way the form reads it", () => {
    expect(minorToPrice(500_000)).toBe("5000");
    expect(minorToPrice(1250)).toBe("12.50");
    expect(priceToMinor(minorToPrice(1205))).toBe(1205);
  });
});

describe("downloadRulesSchema", () => {
  it("takes empty as no limit", () => {
    expect(downloadRulesSchema.parse({ downloadLimit: "", downloadDays: "" })).toEqual({
      downloadLimit: null,
      downloadDays: null,
    });
  });

  it("reads whole numbers within range", () => {
    expect(downloadRulesSchema.parse({ downloadLimit: "3", downloadDays: "365" })).toEqual({
      downloadLimit: 3,
      downloadDays: 365,
    });
  });

  it.each([
    ["0", "30"],
    ["101", "30"],
    ["2.5", "30"],
    ["5", "3651"],
  ])("refuses %s downloads for %s days", (downloadLimit, downloadDays) => {
    expect(downloadRulesSchema.safeParse({ downloadLimit, downloadDays }).success).toBe(false);
  });
});

describe("newDigitalProductSchema", () => {
  const file = new File(["%PDF-1.7"], "guide.pdf", { type: "application/pdf" });

  it("takes a name, a price and the file", () => {
    const result = newDigitalProductSchema.parse({ name: " Guide ", price: "5000", file });
    expect(result).toMatchObject({
      name: "Guide",
      price: 500_000,
      description: "",
      downloadLimit: null,
      downloadDays: null,
    });
  });

  it("asks for the file and refuses one over the limit", () => {
    const empty = newDigitalProductSchema.safeParse({ name: "Guide", price: "5000" });
    expect(empty.success).toBe(false);
    const big = { size: DIGITAL_FILE_MAX_BYTES + 1 } as File;
    const tooBig = newDigitalProductSchema.safeParse({
      name: "Guide",
      price: "5000",
      file: Object.setPrototypeOf(big, File.prototype),
    });
    expect(tooBig.success).toBe(false);
  });

  it("refuses a price of zero", () => {
    expect(newDigitalProductSchema.safeParse({ name: "Guide", price: "0", file }).success).toBe(
      false,
    );
  });
});

describe("digitalCheckoutSchema", () => {
  it("doesn't ask for an address and leaves it empty", () => {
    const result = digitalCheckoutSchema.parse({
      email: "Ana@Example.com",
      name: "Ana",
      phone: "8888-0000",
      paymentMethod: "sinpe",
    });
    expect(result).toMatchObject({
      email: "ana@example.com",
      line1: "",
      city: "",
      province: "",
      notes: "",
    });
  });
});

describe("downloadFileName", () => {
  it("keeps the uploaded name without folders or characters a disk refuses", () => {
    expect(downloadFileName("C:\\Users\\ana\\Guía final.pdf")).toBe("Guía final.pdf");
    expect(downloadFileName('a<b>:"c".zip')).toBe("abc.zip");
    expect(downloadFileName("..")).toBe("download");
  });

  it("shortens a long name and keeps its extension", () => {
    const name = downloadFileName(`${"x".repeat(200)}.epub`);
    expect(name).toHaveLength(120);
    expect(name.endsWith(".epub")).toBe(true);
  });
});

describe("formatFileSize", () => {
  it("reads like people say it", () => {
    expect(formatFileSize(820_000, "en")).toBe("820 kB");
    expect(formatFileSize(12_400_000, "en")).toBe("12.4 MB");
  });
});
