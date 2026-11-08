import { readCatalogQuery } from "@monaztore/contracts";
import {
  getStoreInfo,
  getStoreTheme,
  listStoreFacets,
  listStorePages,
  listStoreProducts,
  listTopCollections,
  type StorefrontContext,
  withoutHiddenFilters,
} from "@monaztore/core";
import { storeOrigin } from "./store-seo";

/** What every storefront page shows around itself: name, menu, pages, currency and theme. */
export async function storeShell(store: StorefrontContext, request: Request) {
  const [info, collections, pages, theme] = await Promise.all([
    getStoreInfo(store),
    listTopCollections(store),
    listStorePages(store),
    getStoreTheme(store),
  ]);
  return {
    name: info.name,
    currency: info.currency,
    origin: storeOrigin(info.canonicalHost, request.url),
    collections,
    pages: pages.map(({ slug, title }) => ({ slug, title })),
    theme,
  };
}

export type StoreShell = Awaited<ReturnType<typeof storeShell>>;

/** `?page=` as a whole page number, 1 when missing or odd. */
export function pageParam(url: URL): number {
  const page = Number.parseInt(url.searchParams.get("page") ?? "", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

/**
 * A catalog page (all products, a collection): the shopper's filters from the URL, the page of
 * products, and, when the store's theme shows filters, what each filter would leave.
 */
export async function catalogPage(
  store: StorefrontContext,
  url: URL,
  { collection }: { collection?: string } = {},
) {
  const query = readCatalogQuery(url.searchParams);
  const theme = await getStoreTheme(store);
  const scope = { ...query, collection };
  const [page, facets] = await Promise.all([
    listStoreProducts(store, scope),
    theme.layout.filters ? listStoreFacets(store, scope) : null,
  ]);
  const shown = facets && withoutHiddenFilters(facets, theme.hiddenFilters);
  // Every filter turned off: no panel at all.
  const any = shown && (shown.price || shown.options.length > 0 || shown.availability);
  return { query, page, facets: any ? shown : null };
}
