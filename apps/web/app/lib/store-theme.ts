import type { StoreTheme } from "@monaztore/core";
import { useRouteLoaderData } from "react-router";
import type { StoreShell } from "./storefront.server";

/** The storefront's frame (name, menu, theme), from the store layout's loader. */
export function useStoreShell(): StoreShell | null {
  return useRouteLoaderData<{ shell: StoreShell | null }>("routes/store/layout")?.shell ?? null;
}

/** The store's theme; the default look outside a store. */
export function useStoreTheme(): StoreTheme["layout"] | null {
  return useStoreShell()?.theme.layout ?? null;
}
