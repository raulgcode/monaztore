import { storeThemeIds } from "@monaztore/contracts";
import { describe, expect, it } from "vitest";
import { brandColors, colorPairs, resolveStoreTheme, storeThemes } from "./theme-presets";

describe("storeThemes", () => {
  it("packages one preset per theme a store can pick", () => {
    expect(Object.keys(storeThemes).toSorted()).toEqual([...storeThemeIds].toSorted());
  });
  it.each(storeThemeIds)("%s reads at WCAG AA in light and dark", (id) => {
    for (const pair of colorPairs(storeThemes[id].colors)) {
      expect(pair.ratio, `${id} ${pair.mode} ${pair.name}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("brandColors", () => {
  it.each(["#fde047", "#0f172a", "#22c55e", "#ffffff", "#000000", "#e11d48"])(
    "turns %s into colors that read in light and dark",
    (brand) => {
      for (const pair of colorPairs(brandColors(brand))) {
        expect(pair.ratio, `${brand} ${pair.mode} ${pair.name}`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});

describe("resolveStoreTheme", () => {
  it("is the default theme for a store that never picked one", () => {
    const theme = resolveStoreTheme();
    expect(theme.id).toBe("essential");
    expect(theme.style["--primary"]).toBe("light-dark(#4338ca, #a5b4fc)");
    expect(theme.logoUrl).toBeNull();
  });
  it("falls back to the default for a theme that no longer exists", () => {
    expect(resolveStoreTheme({ theme: "retro" }).id).toBe("essential");
  });
  it("puts the brand color over the theme's", () => {
    const theme = resolveStoreTheme({ theme: "boutique", brandColor: "#0E7490" });
    expect(theme.layout.productCard).toBe("portrait");
    expect(theme.style["--primary"]).toMatch(/^light-dark\(#0e7490, #[0-9a-f]{6}\)$/);
    expect(theme.style["--heading-font"]).toContain("serif");
  });
  it("keeps up to three highlights of the store's own", () => {
    expect(resolveStoreTheme({ highlights: ["a", "", "b", "c", "d"] }).highlights).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});
