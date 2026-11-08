import { z } from "zod/mini";
import { normalizeHex } from "./color";
import { message } from "./message";

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
