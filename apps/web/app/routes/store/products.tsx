import { getStoreInfo } from "@monaztore/core";
import { CatalogView } from "~/components/storefront/catalog-view";
import { metaT, useT } from "~/lib/i18n";
import { pageMeta, storeOrigin } from "~/lib/store-seo";
import { useStoreTheme } from "~/lib/store-theme";
import { catalogPage } from "~/lib/storefront.server";
import { requireStore } from "~/middleware/store.server";
import type { Route } from "./+types/products";

export async function loader({ request, context }: Route.LoaderArgs) {
  const store = requireStore(context);
  const url = new URL(request.url);
  const [info, catalog] = await Promise.all([getStoreInfo(store), catalogPage(store, url)]);
  const origin = storeOrigin(info.canonicalHost, request.url);
  return {
    ...catalog,
    currency: info.currency,
    storeName: info.name,
    canonical: `${origin}/products`,
    // A search or a filtered list is not a page of its own for search engines.
    indexable: [...url.searchParams.keys()].every((key) => key === "page"),
  };
}

export function meta({ loaderData, matches }: Route.MetaArgs) {
  if (!loaderData) return [];
  const t = metaT(matches);
  const { q } = loaderData.query;
  const title = q ? t("storefront.resultsFor", { q }) : t("storefront.allProducts");
  return [
    ...pageMeta({
      title: `${title} | ${loaderData.storeName}`,
      description: t("storefront.productCount", { count: loaderData.page.total }),
      canonical: loaderData.canonical,
      siteName: loaderData.storeName,
    }),
    ...(loaderData.indexable ? [] : [{ name: "robots", content: "noindex, follow" }]),
  ];
}

export default function Products({ loaderData }: Route.ComponentProps) {
  const t = useT();
  const layout = useStoreTheme();
  const { query, page, facets, currency } = loaderData;
  return (
    <>
      <h1 className="mb-4 font-heading text-2xl font-semibold tracking-tight md:text-3xl">
        {query.q ? t("storefront.resultsFor", { q: query.q }) : t("storefront.allProducts")}
      </h1>
      <CatalogView
        page={page}
        facets={facets}
        query={query}
        currency={currency}
        layout={layout?.productCard ?? "square"}
        empty={query.q ? t("storefront.noResults", { q: query.q }) : t("storefront.noProducts")}
      />
    </>
  );
}
