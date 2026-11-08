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

/** Every color a storefront paints with, in one mode (light or dark). */
export interface PaletteColors {
  background: string;
  foreground: string;
  card: string;
  muted: string;
  mutedForeground: string;
  border: string;
  /** Input borders: 3:1 against the surfaces. */
  input: string;
  primary: string;
  primaryForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
}

/**
 * A theme's set of colors, for light and dark: the surfaces (page, cards, muted bands) and the
 * brand color with what it gives (buttons, links, the soft accent bands). The store owner picks
 * one in Design and may put their own brand color over it.
 */
/** Every theme's palettes: unique, so each has one name (`design.palette_<id>`). */
export type PaletteId =
  | "indigo"
  | "forest"
  | "ocean"
  | "graphite"
  | "rose"
  | "sand"
  | "noir"
  | "sage"
  | "sea"
  | "navy"
  | "field"
  | "slate";

export interface ThemePalette {
  id: PaletteId;
  light: PaletteColors;
  dark: PaletteColors;
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
  /** The theme's palettes; the first is the one a store starts with. */
  palettes: ThemePalette[];
  layout: ThemeLayout;
}

type Surfaces = Omit<
  PaletteColors,
  "primary" | "primaryForeground" | "accent" | "accentForeground"
>;

/** Plain white and near black: the platform's own (app.css). */
const neutral: { light: Surfaces; dark: Surfaces } = {
  light: {
    background: PAGE_BACKGROUND.light,
    foreground: "#18181b",
    card: CARD_BACKGROUND.light,
    muted: "#f4f4f5",
    mutedForeground: "#52525b",
    border: "#e4e4e7",
    input: "#71717a",
    destructive: "#b91c1c",
  },
  dark: {
    background: PAGE_BACKGROUND.dark,
    foreground: "#fafafa",
    card: CARD_BACKGROUND.dark,
    muted: "#27272a",
    mutedForeground: "#a1a1aa",
    border: "#27272a",
    input: "#71717a",
    destructive: "#f87171",
  },
};

/** Paper and espresso: warm, for fashion and handmade goods. */
const warm: { light: Surfaces; dark: Surfaces } = {
  light: {
    background: "#faf7f2",
    foreground: "#1c1917",
    card: "#ffffff",
    muted: "#f1ebe2",
    mutedForeground: "#57534e",
    border: "#e7e0d5",
    input: "#78716c",
    destructive: "#b91c1c",
  },
  dark: {
    background: "#14110f",
    foreground: "#f5f0e8",
    card: "#1f1b18",
    muted: "#2a2420",
    mutedForeground: "#a8a29e",
    border: "#332c26",
    input: "#78716c",
    destructive: "#f87171",
  },
};

/** Cool slate: crisp, for catalogs and businesses. */
const cool: { light: Surfaces; dark: Surfaces } = {
  light: {
    background: "#f8fafc",
    foreground: "#0f172a",
    card: "#ffffff",
    muted: "#f1f5f9",
    mutedForeground: "#475569",
    border: "#e2e8f0",
    input: "#64748b",
    destructive: "#b91c1c",
  },
  dark: {
    background: "#0b1120",
    foreground: "#f1f5f9",
    card: "#131c2e",
    muted: "#1e293b",
    mutedForeground: "#94a3b8",
    border: "#1e293b",
    input: "#64748b",
    destructive: "#f87171",
  },
};

/** A color that reads as text on each of `surfaces` (4.5:1), nudged as little as possible. */
function readableOnAll(color: string, surfaces: string[]): string {
  let result = color;
  for (let round = 0; round < 3; round++) {
    for (const surface of surfaces) result = ensureContrast(result, surface);
  }
  return result;
}

/** The brand's colors on a mode's surfaces: buttons, links and the soft accent bands. */
function brandOn(brand: string, surfaces: Surfaces, mode: "light" | "dark"): PaletteColors {
  const primary = readableOnAll(brand, [surfaces.card, surfaces.background]);
  const accent = mixColors(primary, surfaces.background, mode === "light" ? 0.9 : 0.82);
  return {
    ...surfaces,
    primary,
    primaryForeground: readableOn(
      primary,
      mode === "light" ? surfaces.foreground : surfaces.background,
      "#ffffff",
    ),
    accent,
    accentForeground: readableOnAll(primary, [accent]),
  };
}

function palette(
  id: PaletteId,
  surfaces: { light: Surfaces; dark: Surfaces },
  brand: { light: string; dark: string },
): ThemePalette {
  return {
    id,
    light: brandOn(brand.light, surfaces.light, "light"),
    dark: brandOn(brand.dark, surfaces.dark, "dark"),
  };
}

export const storeThemes: Record<StoreThemeId, StoreThemePreset> = {
  // Any store: clean, neutral, the platform's indigo.
  essential: {
    id: "essential",
    palettes: [
      palette("indigo", neutral, { light: "#4338ca", dark: "#a5b4fc" }),
      palette("forest", neutral, { light: "#15803d", dark: "#86efac" }),
      palette("ocean", cool, { light: "#0369a1", dark: "#7dd3fc" }),
      palette("graphite", neutral, { light: "#18181b", dark: "#fafafa" }),
    ],
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
    palettes: [
      palette("rose", neutral, { light: "#be185d", dark: "#f9a8d4" }),
      palette("sand", warm, { light: "#9a3412", dark: "#fdba74" }),
      palette("noir", neutral, { light: "#18181b", dark: "#fafafa" }),
      palette("sage", warm, { light: "#3f6212", dark: "#bef264" }),
    ],
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
    palettes: [
      palette("sea", cool, { light: "#0e7490", dark: "#67e8f9" }),
      palette("navy", cool, { light: "#1e3a8a", dark: "#93c5fd" }),
      palette("field", neutral, { light: "#166534", dark: "#86efac" }),
      palette("slate", cool, { light: "#334155", dark: "#cbd5e1" }),
    ],
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

/** The theme's palette with this id, or its first one. */
export function paletteOf(theme: StoreThemeId, id?: string): ThemePalette {
  const { palettes } = storeThemes[theme];
  const found = palettes.find((palette) => palette.id === id) ?? palettes[0];
  if (!found) throw new Error(`Theme ${theme} has no palettes`);
  return found;
}

/** A palette's surfaces with the store's own brand color: readable in light and dark. */
export function brandPalette(base: ThemePalette, brand: string): ThemePalette {
  const strip = ({
    primary,
    primaryForeground,
    accent,
    accentForeground,
    ...rest
  }: PaletteColors) => rest;
  return {
    id: base.id,
    light: brandOn(brand, strip(base.light), "light"),
    dark: brandOn(brand, strip(base.dark), "dark"),
  };
}

/** Every text-on-surface pair of a palette (4.5:1) and its graphics (3:1), for the AA checks. */
export function contrastChecks(colors: { light: PaletteColors; dark: PaletteColors }) {
  return (["light", "dark"] as const).flatMap((mode) => {
    const c = colors[mode];
    const text: [string, string, string][] = [
      ["text", c.foreground, c.background],
      ["text on a card", c.foreground, c.card],
      ["text on muted", c.foreground, c.muted],
      ["muted text", c.mutedForeground, c.background],
      ["muted text on a card", c.mutedForeground, c.card],
      ["muted text on muted", c.mutedForeground, c.muted],
      ["button", c.primaryForeground, c.primary],
      ["link", c.primary, c.background],
      ["link on a card", c.primary, c.card],
      ["accent", c.accentForeground, c.accent],
      ["error", c.destructive, c.background],
      ["error on a card", c.destructive, c.card],
    ];
    const graphics: [string, string, string][] = [
      ["input border", c.input, c.background],
      ["input border on a card", c.input, c.card],
    ];
    return [
      ...text.map(([name, a, b]) => ({ mode, name, ratio: contrastRatio(a, b), minimum: 4.5 })),
      ...graphics.map(([name, a, b]) => ({ mode, name, ratio: contrastRatio(a, b), minimum: 3 })),
    ];
  });
}

export interface StoreTheme {
  id: StoreThemeId;
  /** The palette in use (the theme's first when the store never picked one). */
  palette: PaletteId;
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
  /** Catalog filters the owner turned off (`withoutHiddenFilters`). */
  hiddenFilters: string[];
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
  const base = paletteOf(id, settings.palette);
  const colors = brand ? brandPalette(base, brand) : base;
  const pair = (key: keyof PaletteColors) =>
    `light-dark(${colors.light[key]}, ${colors.dark[key]})`;
  return {
    id,
    palette: base.id,
    layout: preset.layout,
    style: {
      "--background": pair("background"),
      "--foreground": pair("foreground"),
      "--card": pair("card"),
      "--card-foreground": pair("foreground"),
      "--popover": pair("card"),
      "--popover-foreground": pair("foreground"),
      "--secondary": pair("muted"),
      "--secondary-foreground": pair("foreground"),
      "--muted": pair("muted"),
      "--muted-foreground": pair("mutedForeground"),
      "--border": pair("border"),
      "--input": pair("input"),
      "--primary": pair("primary"),
      "--primary-foreground": pair("primaryForeground"),
      "--ring": pair("primary"),
      "--link": pair("primary"),
      "--accent": pair("accent"),
      "--accent-foreground": pair("accentForeground"),
      "--destructive": pair("destructive"),
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
    hiddenFilters: settings.hiddenFilters ?? [],
  };
}
