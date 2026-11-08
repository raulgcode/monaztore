import { storeThemeIds } from "@monaztore/contracts";
import { describe, expect, it } from "vitest";
import {
  brandPalette,
  contrastChecks,
  paletteOf,
  resolveStoreTheme,
  storeThemes,
} from "./theme-presets";

const everyPalette = storeThemeIds.flatMap((theme) =>
  storeThemes[theme].palettes.map((palette) => [theme, palette] as const),
);

describe("storeThemes", () => {
  it("packages one preset per theme a store can pick", () => {
    expect(Object.keys(storeThemes).toSorted()).toEqual([...storeThemeIds].toSorted());
  });
  it("gives every theme at least three palettes, each with an id of its own", () => {
    for (const theme of storeThemeIds) {
      expect(storeThemes[theme].palettes.length).toBeGreaterThanOrEqual(3);
    }
    const ids = everyPalette.map(([, palette]) => palette.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it.each(everyPalette)("%s · %o reads at WCAG AA in light and dark", (theme, palette) => {
    for (const check of contrastChecks(palette)) {
      expect(
        check.ratio,
        `${theme} ${palette.id} ${check.mode} ${check.name}`,
      ).toBeGreaterThanOrEqual(check.minimum);
    }
  });
});

describe("brandPalette", () => {
  it.each(["#fde047", "#0f172a", "#22c55e", "#ffffff", "#000000", "#e11d48"])(
    "turns %s into colors that read on every palette's surfaces, in light and dark",
    (brand) => {
      for (const [, palette] of everyPalette) {
        for (const check of contrastChecks(brandPalette(palette, brand))) {
          expect(
            check.ratio,
            `${brand} on ${palette.id} ${check.mode} ${check.name}`,
          ).toBeGreaterThanOrEqual(check.minimum);
        }
      }
    },
  );
});

describe("paletteOf", () => {
  it("is the theme's first palette for one it doesn't have", () => {
    expect(paletteOf("boutique", "sand").id).toBe("sand");
    expect(paletteOf("boutique", "navy").id).toBe(storeThemes.boutique.palettes[0]?.id);
    expect(paletteOf("wholesale").id).toBe(storeThemes.wholesale.palettes[0]?.id);
  });
});

describe("resolveStoreTheme", () => {
  it("is the default theme for a store that never picked one", () => {
    const theme = resolveStoreTheme();
    expect(theme.id).toBe("essential");
    expect(theme.palette).toBe("indigo");
    expect(theme.style["--primary"]).toBe("light-dark(#4338ca, #a5b4fc)");
    expect(theme.style["--background"]).toBe("light-dark(#ffffff, #09090b)");
    expect(theme.logoUrl).toBeNull();
  });
  it("falls back to the default for a theme that no longer exists", () => {
    expect(resolveStoreTheme({ theme: "retro" }).id).toBe("essential");
  });
  it("paints the palette's surfaces, not only its buttons", () => {
    const theme = resolveStoreTheme({ theme: "boutique", palette: "sand" });
    expect(theme.palette).toBe("sand");
    expect(theme.style["--background"]).toMatch(/^light-dark\(#faf7f2, #[0-9a-f]{6}\)$/);
    expect(theme.style["--card"]).toBeDefined();
    expect(theme.style["--muted-foreground"]).toBeDefined();
  });
  it("puts the brand color over the palette's", () => {
    const theme = resolveStoreTheme({ theme: "boutique", palette: "sand", brandColor: "#0E7490" });
    expect(theme.layout.productCard).toBe("portrait");
    expect(theme.style["--primary"]).toMatch(/^light-dark\(#0e7490, #[0-9a-f]{6}\)$/);
    expect(theme.style["--background"]).toMatch(/^light-dark\(#faf7f2, /);
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
