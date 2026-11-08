/**
 * The storefront's themes. Their looks live in @monaztore/core (`storeThemes`); this is only the
 * list a form can pick from. The first one is what a store gets until it picks another.
 */
export const storeThemeIds = ["essential", "boutique", "wholesale"] as const;
export type StoreThemeId = (typeof storeThemeIds)[number];
export const defaultStoreThemeId: StoreThemeId = "essential";
