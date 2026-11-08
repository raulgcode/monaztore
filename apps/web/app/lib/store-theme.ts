import type { StoreTheme } from "@monaztore/core";
import { useRouteLoaderData } from "react-router";
import { useT } from "./i18n";
import type { StoreShell } from "./storefront.server";

/** The storefront's frame (name, menu, theme), from the store layout's loader. */
export function useStoreShell(): StoreShell | null {
  return useRouteLoaderData<{ shell: StoreShell | null }>("routes/store/layout")?.shell ?? null;
}

/** The store's theme; the default look outside a store. */
export function useStoreTheme(): StoreTheme["layout"] | null {
  return useStoreShell()?.theme.layout ?? null;
}

/** What the store promises (its own, or its theme's): on the front page and beside each product. */
export function useStoreHighlights(): string[] {
  const t = useT();
  const theme = useStoreShell()?.theme;
  if (!theme) return [];
  return theme.highlights.length > 0
    ? theme.highlights
    : ([1, 2, 3] as const).map((n) => t(`storefront.highlight_${theme.id}_${n}`));
}
