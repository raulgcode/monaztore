import type { StoreThemeInput } from "@monaztore/contracts";
import { eq, schema } from "@monaztore/db";
import type { StoreThemeSettings } from "@monaztore/db/schema";
import { DomainError } from "./errors";
import type { StorefrontContext } from "./storefront";
import type { TenantContext } from "./tenant";
import { resolveStoreTheme, type StoreTheme } from "./theme-presets";

/** Reading and saving a store's theme. The themes themselves live in `theme-presets.ts`. */

async function themeSettings(db: TenantContext["db"], organizationId: string) {
  const [row] = await db
    .select({ theme: schema.storeSettings.theme })
    .from(schema.storeSettings)
    .where(eq(schema.storeSettings.organizationId, organizationId));
  return row?.theme ?? {};
}

/** The storefront's theme, for every public page. */
export async function getStoreTheme(ctx: StorefrontContext): Promise<StoreTheme> {
  return resolveStoreTheme(await themeSettings(ctx.db, ctx.store.organizationId));
}

/** The theme as the store set it, for the workspace's form. */
export function getThemeSettings(ctx: TenantContext): Promise<StoreThemeSettings> {
  return themeSettings(ctx.db, ctx.organizationId);
}

/**
 * Saves the theme and the brand. `logoUrl`/`hero` are addresses `saveStoreImage` returned (a
 * new upload), null to take the photo away, or undefined to keep what was there.
 * Owners only.
 */
export async function updateStoreTheme(
  ctx: TenantContext,
  input: StoreThemeInput,
  images: {
    logoUrl?: string | null;
    /** A new cover photo: the big one and the phone's. */
    hero?: { url: string; smallUrl: string } | null;
  } = {},
): Promise<StoreThemeSettings> {
  if (ctx.role !== "owner") throw new DomainError("forbidden", "Only owners change the design");
  const current = await getThemeSettings(ctx);
  const logoUrl =
    images.logoUrl !== undefined ? images.logoUrl : input.removeLogo ? null : current.logoUrl;
  const hero =
    images.hero !== undefined
      ? images.hero
      : input.removeHero || !current.heroImageUrl
        ? null
        : { url: current.heroImageUrl, smallUrl: current.heroImageSmallUrl };
  const theme: StoreThemeSettings = {
    theme: input.theme,
    ...(input.palette ? { palette: input.palette } : {}),
    ...(input.brandColor ? { brandColor: input.brandColor } : {}),
    ...(logoUrl ? { logoUrl } : {}),
    ...(hero ? { heroImageUrl: hero.url } : {}),
    ...(hero?.smallUrl ? { heroImageSmallUrl: hero.smallUrl } : {}),
    heroTitle: input.heroTitle,
    heroSubtitle: input.heroSubtitle,
    announcement: input.announcement,
    highlights: [input.highlight1, input.highlight2, input.highlight3].filter(Boolean),
    // The filters offered on the form and left unticked; any other stays as it was.
    ...hiddenFiltersOf(input, current.hiddenFilters ?? []),
  };
  await ctx.db
    .insert(schema.storeSettings)
    .values({ organizationId: ctx.organizationId, theme })
    .onConflictDoUpdate({ target: schema.storeSettings.organizationId, set: { theme } });
  return theme;
}

function hiddenFiltersOf(
  input: StoreThemeInput,
  current: string[],
): Pick<StoreThemeSettings, "hiddenFilters"> {
  const offered = new Set(input.offeredFilters);
  const hidden = [
    ...current.filter((key) => !offered.has(key)),
    ...input.offeredFilters.filter((key) => !input.shownFilters.includes(key)),
  ];
  return hidden.length > 0 ? { hiddenFilters: [...new Set(hidden)] } : {};
}
