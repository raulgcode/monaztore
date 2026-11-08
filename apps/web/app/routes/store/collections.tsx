import { getStoreInfo, listTopCollections } from "@monaztore/core";
import { href, Link } from "react-router";
import { metaT, useT } from "~/lib/i18n";
import { pageMeta, storeOrigin } from "~/lib/store-seo";
import { categoriesLabelOf, useStoreShell } from "~/lib/store-theme";
import type { StoreShell } from "~/lib/storefront.server";
import { requireStore } from "~/middleware/store.server";
import type { Route } from "./+types/collections";

export async function loader({ request, context }: Route.LoaderArgs) {
  const store = requireStore(context);
  const [info, collections] = await Promise.all([getStoreInfo(store), listTopCollections(store)]);
  const origin = storeOrigin(info.canonicalHost, request.url);
  return { collections, storeName: info.name, canonical: `${origin}${href("/collections")}` };
}

export function meta({ loaderData, matches }: Route.MetaArgs) {
  if (!loaderData) return [];
  const t = metaT(matches);
  const shell = (
    matches.find((match) => match?.id === "routes/store/layout")?.loaderData as
      | { shell?: StoreShell | null }
      | undefined
  )?.shell;
  return pageMeta({
    title: `${categoriesLabelOf(shell, t("storefront.collections"))} | ${loaderData.storeName}`,
    description: loaderData.collections.map((c) => c.name).join(", "),
    canonical: loaderData.canonical,
    siteName: loaderData.storeName,
  });
}

export default function Collections({ loaderData }: Route.ComponentProps) {
  const t = useT();
  const title = categoriesLabelOf(useStoreShell(), t("storefront.collections"));
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{title}</h1>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {loaderData.collections.map((collection) => (
          <li key={collection.slug}>
            <Link
              to={href("/collections/:slug", { slug: collection.slug })}
              className="flex min-h-14 items-center rounded-md border px-4 font-medium outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {collection.name}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
