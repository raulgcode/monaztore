import { describe, expect, it } from "vitest";
import { contrastRatio, ensureContrast, mixColors, normalizeHex, readableOn } from "./color";

describe("normalizeHex", () => {
  it("reads short, long and hash-less colors", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("be185d")).toBe("#be185d");
    expect(normalizeHex(" #0E7490 ")).toBe("#0e7490");
  });
  it("refuses what isn't a color", () => {
    expect(normalizeHex("red")).toBeUndefined();
    expect(normalizeHex("#12345")).toBeUndefined();
  });
});

describe("contrastRatio", () => {
  it("goes from 1 (same color) to 21 (black on white)", () => {
    expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21);
  });
});

describe("ensureContrast", () => {
  it("keeps a color that already reads", () => {
    expect(ensureContrast("#4338ca", "#ffffff")).toBe("#4338ca");
  });
  it("darkens a light brand color on a white page until it reaches AA", () => {
    const fixed = ensureContrast("#fde047", "#ffffff");
    expect(contrastRatio(fixed, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
  it("lightens a dark brand color on a dark page until it reaches AA", () => {
    const fixed = ensureContrast("#1e3a8a", "#09090b");
    expect(contrastRatio(fixed, "#09090b")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("mixColors and readableOn", () => {
  it("mixes halfway", () => {
    expect(mixColors("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
  it("picks dark text on yellow and white text on navy", () => {
    expect(readableOn("#fde047")).toBe("#18181b");
    expect(readableOn("#1e3a8a")).toBe("#ffffff");
  });
});
