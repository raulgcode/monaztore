import { getStoreInfo, listTopCollections, type StorefrontContext } from "@monaztore/core";
import { storeOrigin } from "./store-seo";

/** What every storefront page shows around itself: the store's name, menu and currency. */
export async function storeShell(store: StorefrontContext, request: Request) {
  const [info, collections] = await Promise.all([getStoreInfo(store), listTopCollections(store)]);
  return {
    name: info.name,
    currency: info.currency,
    origin: storeOrigin(info.canonicalHost, request.url),
    collections,
  };
}

export type StoreShell = Awaited<ReturnType<typeof storeShell>>;

/** `?page=` as a whole page number, 1 when missing or odd. */
export function pageParam(url: URL): number {
  const page = Number.parseInt(url.searchParams.get("page") ?? "", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}
