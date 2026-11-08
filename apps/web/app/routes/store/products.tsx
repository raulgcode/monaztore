import { getStoreInfo, listStoreProducts } from "@monaztore/core";
import { Pagination } from "~/components/storefront/pagination";
import { ProductGrid } from "~/components/storefront/product-grid";
import { metaT, useT } from "~/lib/i18n";
import { pageMeta, storeOrigin } from "~/lib/store-seo";
import { pageParam } from "~/lib/storefront.server";
import { requireStore } from "~/middleware/store.server";
import type { Route } from "./+types/products";

export async function loader({ request, context }: Route.LoaderArgs) {
  const store = requireStore(context);
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const [info, page] = await Promise.all([
    getStoreInfo(store),
    listStoreProducts(store, { q, page: pageParam(url) }),
  ]);
  const origin = storeOrigin(info.canonicalHost, request.url);
  return {
    q,
    page,
    currency: info.currency,
    storeName: info.name,
    canonical: `${origin}/products`,
  };
}

export function meta({ loaderData, matches }: Route.MetaArgs) {
  if (!loaderData) return [];
  const t = metaT(matches);
  const title = loaderData.q
    ? t("storefront.resultsFor", { q: loaderData.q })
    : t("storefront.allProducts");
  return [
    ...pageMeta({
      title: `${title} | ${loaderData.storeName}`,
      description: t("storefront.productCount", { count: loaderData.page.total }),
      canonical: loaderData.canonical,
      siteName: loaderData.storeName,
    }),
    // A search is not a page of its own for search engines.
    ...(loaderData.q ? [{ name: "robots", content: "noindex, follow" }] : []),
  ];
}

export default function Products({ loaderData }: Route.ComponentProps) {
  const t = useT();
  const { q, page, currency } = loaderData;
  return (
    <>
      <div className="mb-6 grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {q ? t("storefront.resultsFor", { q }) : t("storefront.allProducts")}
        </h1>
        <p className="text-muted-foreground" role="status">
          {t("storefront.productCount", { count: page.total })}
        </p>
      </div>
      {page.products.length > 0 ? (
        <ProductGrid products={page.products} currency={currency} />
      ) : (
        <p className="py-10 text-center text-muted-foreground">
          {q ? t("storefront.noResults", { q }) : t("storefront.noProducts")}
        </p>
      )}
      <Pagination page={page.page} pages={page.pages} />
    </>
  );
}
