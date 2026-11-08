import {
  contrastRatio,
  ensureContrast,
  mixColors,
  normalizeHex,
  readableOn,
} from "@monaztore/contracts/color";
import {
  defaultStoreThemeId,
  type StoreThemeId,
  storeThemeIds,
} from "@monaztore/contracts/store-theme-ids";
import type { StoreThemeSettings } from "@monaztore/db/schema";

/**
 * The storefront's themes, packaged with Monaztore: every store picks one in the workspace
 * ("Store design") and puts its brand on top (color, logo, cover photo, texts). A theme is data:
 * the colors the page uses (CSS variables, light and dark) and how the pages are laid out. The
 * web paints it; nothing here downloads fonts or scripts, so every theme fits the Lighthouse
 * budget. Pure, so the workspace's preview runs it in the browser (`@monaztore/core/themes`).
 */

/** The page's backgrounds (`--background` in app.css): every color is checked against them. */
export const PAGE_BACKGROUND = { light: "#ffffff", dark: "#09090b" } as const;
/** Cards (`--card`): in dark they are lighter than the page, so links need more there. */
export const CARD_BACKGROUND = { light: "#ffffff", dark: "#18181b" } as const;

export interface ThemeColors {
  primary: string;
  primaryForeground: string;
  accent: string;
  accentForeground: string;
}

export interface ThemeLayout {
  /**
   * banner: a band of the brand's color (or the cover photo) with the title.
   * spotlight: the cover photo full width with the title over it (fashion, lifestyle).
   * compact: a short band with the search box first (catalogs, wholesale).
   */
  hero: "banner" | "spotlight" | "compact";
  /** square: 1:1 photos; portrait: 4:5, for clothes; row: a dense list with the code (SKU). */
  productCard: "square" | "portrait" | "row";
  /** Filters beside the catalog (size, color, price…), or only the order and search. */
  filters: boolean;
  /** The front page's sections, in order, after the hero. */
  sections: ("highlights" | "collections" | "new" | "sale")[];
  /** How many new products the front page shows. */
  homeProducts: number;
  /** Headings in the system's serif (no web font to download) or its sans. */
  headingFont: "sans" | "serif";
  /** Corner radius, rem. */
  radius: number;
}

export interface StoreThemePreset {
  id: StoreThemeId;
  /** Who it is for, as an i18n key suffix: `store.theme_<id>`, `store.theme_<id>For`. */
  colors: { light: ThemeColors; dark: ThemeColors };
  layout: ThemeLayout;
}

export const storeThemes: Record<StoreThemeId, StoreThemePreset> = {
  // Any store: clean, neutral, the platform's indigo.
  essential: {
    id: "essential",
    colors: {
      light: {
        primary: "#4338ca",
        primaryForeground: "#ffffff",
        accent: "#eef2ff",
        accentForeground: "#3730a3",
      },
      dark: {
        primary: "#a5b4fc",
        primaryForeground: "#1e1b4b",
        accent: "#1e1b4b",
        accentForeground: "#e0e7ff",
      },
    },
    layout: {
      hero: "banner",
      productCard: "square",
      filters: true,
      sections: ["collections", "new", "sale"],
      homeProducts: 8,
      headingFont: "sans",
      radius: 0.75,
    },
  },
  // Clothes, socks and accessories: big photos, tall cards, serif headings, filters by size.
  boutique: {
    id: "boutique",
    colors: {
      light: {
        primary: "#be185d",
        primaryForeground: "#ffffff",
        accent: "#fdf2f8",
        accentForeground: "#9d174d",
      },
      dark: {
        primary: "#f9a8d4",
        primaryForeground: "#500724",
        accent: "#3b0a22",
        accentForeground: "#fbcfe8",
      },
    },
    layout: {
      hero: "spotlight",
      productCard: "portrait",
      filters: true,
      sections: ["highlights", "collections", "new", "sale"],
      homeProducts: 8,
      headingFont: "serif",
      radius: 0.25,
    },
  },
  // Selling to businesses (seafood, produce, supplies): a dense list with codes, search first.
  wholesale: {
    id: "wholesale",
    colors: {
      light: {
        primary: "#0e7490",
        primaryForeground: "#ffffff",
        accent: "#ecfeff",
        accentForeground: "#155e75",
      },
      dark: {
        primary: "#67e8f9",
        primaryForeground: "#083344",
        accent: "#082f3a",
        accentForeground: "#a5f3fc",
      },
    },
    layout: {
      hero: "compact",
      productCard: "row",
      filters: false,
      sections: ["highlights", "collections", "new"],
      homeProducts: 12,
      headingFont: "sans",
      radius: 0.5,
    },
  },
};

/** The colors a brand color gives: readable as a button and as a link, in light and dark. */
export function brandColors(brand: string): { light: ThemeColors; dark: ThemeColors } {
  const light = ensureContrast(brand, CARD_BACKGROUND.light);
  const dark = ensureContrast(brand, CARD_BACKGROUND.dark);
  const lightAccent = mixColors(light, PAGE_BACKGROUND.light, 0.9);
  const darkAccent = mixColors(dark, PAGE_BACKGROUND.dark, 0.82);
  return {
    light: {
      primary: light,
      primaryForeground: readableOn(light, "#18181b", "#ffffff"),
      accent: lightAccent,
      accentForeground: ensureContrast(light, lightAccent),
    },
    dark: {
      primary: dark,
      primaryForeground: readableOn(dark, PAGE_BACKGROUND.dark, "#ffffff"),
      accent: darkAccent,
      accentForeground: ensureContrast(dark, darkAccent),
    },
  };
}

/** Every text-on-surface pair of a palette, for the AA checks. */
export function colorPairs(colors: { light: ThemeColors; dark: ThemeColors }) {
  return (["light", "dark"] as const).flatMap((mode) => {
    const c = colors[mode];
    const page = PAGE_BACKGROUND[mode];
    return [
      { mode, name: "button", ratio: contrastRatio(c.primaryForeground, c.primary) },
      { mode, name: "link", ratio: contrastRatio(c.primary, page) },
      { mode, name: "link on a card", ratio: contrastRatio(c.primary, CARD_BACKGROUND[mode]) },
      { mode, name: "accent", ratio: contrastRatio(c.accentForeground, c.accent) },
    ];
  });
}

export interface StoreTheme {
  id: StoreThemeId;
  layout: ThemeLayout;
  /** CSS variables for the storefront's frame: `{ "--primary": "light-dark(#…, #…)" }`. */
  style: Record<`--${string}`, string>;
  logoUrl: string | null;
  heroImageUrl: string | null;
  heroImageSmallUrl: string | null;
  heroTitle: string;
  heroSubtitle: string;
  announcement: string;
  /** The store's own; empty = the theme's (translated by the web). */
  highlights: string[];
}

const fonts = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
};

/** The theme a store's settings describe: the preset, with the brand on top. Pure. */
export function resolveStoreTheme(settings: StoreThemeSettings = {}): StoreTheme {
  const id = storeThemeIds.includes(settings.theme as StoreThemeId)
    ? (settings.theme as StoreThemeId)
    : defaultStoreThemeId;
  const preset = storeThemes[id];
  const brand = settings.brandColor ? normalizeHex(settings.brandColor) : undefined;
  const colors = brand ? brandColors(brand) : preset.colors;
  const pair = (key: keyof ThemeColors) => `light-dark(${colors.light[key]}, ${colors.dark[key]})`;
  return {
    id,
    layout: preset.layout,
    style: {
      "--primary": pair("primary"),
      "--primary-foreground": pair("primaryForeground"),
      "--ring": pair("primary"),
      "--link": pair("primary"),
      "--accent": pair("accent"),
      "--accent-foreground": pair("accentForeground"),
      "--radius": `${preset.layout.radius}rem`,
      "--heading-font": fonts[preset.layout.headingFont],
    },
    logoUrl: settings.logoUrl || null,
    heroImageUrl: settings.heroImageUrl || null,
    heroImageSmallUrl: (settings.heroImageUrl && settings.heroImageSmallUrl) || null,
    heroTitle: settings.heroTitle ?? "",
    heroSubtitle: settings.heroSubtitle ?? "",
    announcement: settings.announcement ?? "",
    highlights: (settings.highlights ?? []).filter(Boolean).slice(0, 3),
  };
}
