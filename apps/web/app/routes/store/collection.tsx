import { getStoreCollection, getStoreInfo, listStoreProducts } from "@monaztore/core";
import { data, href, Link } from "react-router";
import { Pagination } from "~/components/storefront/pagination";
import { ProductGrid } from "~/components/storefront/product-grid";
import { useT } from "~/lib/i18n";
import { pageMeta, storeOrigin } from "~/lib/store-seo";
import { pageParam } from "~/lib/storefront.server";
import { requireStore } from "~/middleware/store.server";
import type { Route } from "./+types/collection";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const store = requireStore(context);
  const url = new URL(request.url);
  const [collection, info, page] = await Promise.all([
    getStoreCollection(store, params.slug),
    getStoreInfo(store),
    listStoreProducts(store, { collection: params.slug, page: pageParam(url) }),
  ]);
  if (!collection) throw data("Collection not found", { status: 404 });
  const origin = storeOrigin(info.canonicalHost, request.url);
  return {
    collection,
    page,
    currency: info.currency,
    storeName: info.name,
    canonical: `${origin}${href("/collections/:slug", { slug: collection.slug })}`,
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [];
  const { collection, storeName, canonical } = loaderData;
  return pageMeta({
    title: `${collection.name} | ${storeName}`,
    description: collection.summary || collection.name,
    canonical,
    image: collection.imageUrl,
    siteName: storeName,
  });
}

export default function Collection({ loaderData }: Route.ComponentProps) {
  const t = useT();
  const { collection, page, currency } = loaderData;
  return (
    <>
      <div className="mb-6 grid gap-1">
        {collection.parent ? (
          <Link
            to={href("/collections/:slug", { slug: collection.parent.slug })}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            {t("storefront.subcollectionOf", { name: collection.parent.name })}
          </Link>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight">{collection.name}</h1>
        <p className="text-muted-foreground">
          {t("storefront.productCount", { count: page.total })}
        </p>
        {collection.descriptionHtml ? (
          <div
            className="store-prose mt-2 text-muted-foreground"
            // Cleaned in @monaztore/core (`cleanHtml`): formatting and safe links only.
            dangerouslySetInnerHTML={{ __html: collection.descriptionHtml }}
          />
        ) : null}
      </div>
      {page.products.length > 0 ? (
        <ProductGrid products={page.products} currency={currency} />
      ) : (
        <p className="py-10 text-center text-muted-foreground">{t("storefront.noProducts")}</p>
      )}
      <Pagination page={page.page} pages={page.pages} />
    </>
  );
}
