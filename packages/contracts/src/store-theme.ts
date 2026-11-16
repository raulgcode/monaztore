import { z } from "zod/mini";
import { normalizeHex } from "./color";
import { storeIllustrationIds } from "./illustrations";
import { message } from "./message";
import { linkTarget } from "./pages";

export { defaultStoreThemeId, type StoreThemeId, storeThemeIds } from "./store-theme-ids";

import { storeThemeIds } from "./store-theme-ids";

export const HIGHLIGHTS_MAX = 3;

/** A list from repeated form fields: none, one or many. */
const stringList = z._default(
  z.pipe(
    z.union([z.string(), z.array(z.string())]),
    z.transform((value) => (Array.isArray(value) ? value : [value]).slice(0, 20)),
  ),
  [],
);

const optionalText = (max: number) =>
  z._default(z.string().check(z.trim(), z.maxLength(max, message("forms.textTooLong"))), "");

const checkbox = z._default(
  z.pipe(
    z.optional(z.string()),
    z.transform((value) => value === "on"),
  ),
  false,
);

/** Links in the store's menu: "Socks", "Mugs", "Questions"… A link may open a few more under it. */
export const STORE_MENU_MAX = 8;
export const STORE_SUBMENU_MAX = 8;

export const storeMenuLinkSchema = z.object({
  label: z.string().check(z.trim(), z.minLength(1), z.maxLength(40)),
  href: linkTarget,
});
export const storeMenuItemSchema = z.object({
  label: z.string().check(z.trim(), z.minLength(1), z.maxLength(40)),
  href: linkTarget,
  children: z._default(z.array(storeMenuLinkSchema).check(z.maxLength(STORE_SUBMENU_MAX)), []),
});
export const storeMenuSchema = z.array(storeMenuItemSchema).check(z.maxLength(STORE_MENU_MAX));
export type StoreMenuLink = z.infer<typeof storeMenuLinkSchema>;
export type StoreMenuItem = z.infer<typeof storeMenuItemSchema>;

/** The footer's links: flat, a few more allowed. Empty = the store's published pages. */
export const FOOTER_MENU_MAX = 12;
export const storeFooterMenuSchema = z
  .array(storeMenuLinkSchema)
  .check(z.maxLength(FOOTER_MENU_MAX));

const blankRow = (row: unknown) =>
  Boolean(
    row &&
      typeof row === "object" &&
      !String((row as StoreMenuLink).label ?? "").trim() &&
      !String((row as StoreMenuLink).href ?? "").trim(),
  );

/** A menu travels as JSON in one hidden field; rows left empty are dropped, anything off is one error. */
function menuJson<T>(schema: { safeParse: (value: unknown) => { success: boolean; data?: T } }) {
  return z.pipe(
    z._default(z.string(), "[]"),
    z.transform((value, ctx): T | [] => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        parsed = undefined;
      }
      const rows = Array.isArray(parsed)
        ? parsed
            .filter((row) => !blankRow(row))
            .map((row) =>
              row && typeof row === "object" && Array.isArray((row as StoreMenuItem).children)
                ? {
                    ...row,
                    children: (row as StoreMenuItem).children.filter((child) => !blankRow(child)),
                  }
                : row,
            )
        : parsed;
      const result = schema.safeParse(rows);
      if (!result.success || result.data === undefined) {
        ctx.issues.push({ code: "custom", input: value, message: message("forms.menuInvalid") });
        return [];
      }
      return result.data;
    }),
  );
}

/**
 * "Store design" in the workspace: the theme and how it carries the store's brand. The logo and
 * the cover photo come as files next to this form; `removeLogo`/`removeHero` take them away.
 */
export const storeThemeSchema = z.object({
  theme: z.enum(storeThemeIds, { error: message("forms.themeRequired") }),
  /** The theme's palette; one it doesn't have falls back to its first (core). */
  palette: z._default(z.string().check(z.trim(), z.maxLength(40)), ""),
  brandColor: z._default(
    z.pipe(
      z.string().check(z.trim()),
      z.transform((value, ctx) => {
        if (value === "") return "";
        const hex = normalizeHex(value);
        if (!hex) {
          ctx.issues.push({
            code: "custom",
            input: value,
            message: message("forms.colorInvalid"),
          });
          return z.NEVER;
        }
        return hex;
      }),
    ),
    "",
  ),
  heroTitle: optionalText(80),
  heroSubtitle: optionalText(160),
  /** No cover on the front page: it starts with the products. Missing = the cover shows. */
  hideHero: checkbox,
  /** No strip of three promises ("Delivery in 24 h") on the front page. */
  hideHighlights: checkbox,
  /** A short line above the title: "New", "Made for you". */
  heroEyebrow: optionalText(40),
  heroButtonLabel: optionalText(40),
  /** Where the cover's button goes (a page, a product, a collection); empty = the catalog. */
  heroButtonHref: z._default(z.union([z.literal(""), linkTarget]), ""),
  /** A built-in drawing for a cover without a photo. */
  heroIllustration: z._default(z.union([z.literal(""), z.enum(storeIllustrationIds)]), ""),
  /** The row of category buttons under the search box; off = only the menu. */
  categoryChips: checkbox,
  /** No "Categories" panel in the menu: only the store's own links. Missing = it shows. */
  hideCategoriesMenu: checkbox,
  menu: menuJson<StoreMenuItem[]>(storeMenuSchema),
  footerMenu: menuJson<StoreMenuLink[]>(storeFooterMenuSchema),
  announcement: optionalText(120),
  categoriesLabel: optionalText(40),
  highlight1: optionalText(60),
  highlight2: optionalText(60),
  highlight3: optionalText(60),
  removeLogo: checkbox,
  removeHero: checkbox,
  /** The catalog filters the form offered, and those left ticked: the rest are turned off. */
  offeredFilters: stringList,
  shownFilters: stringList,
});
export type StoreThemeInput = z.infer<typeof storeThemeSchema>;
