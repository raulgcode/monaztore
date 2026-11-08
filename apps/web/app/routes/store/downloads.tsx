import { getDownloadsByLink } from "@monaztore/core";
import { data, href, useSearchParams } from "react-router";
import { DownloadList, RefusedDownload } from "~/components/storefront/download-list";
import { metaT, useT } from "~/lib/i18n";
import { requireStore } from "~/middleware/store.server";
import type { Route } from "./+types/downloads";

export function meta({ loaderData, matches }: Route.MetaArgs) {
  if (!loaderData) return [];
  return [
    {
      title: metaT(matches)("storefront.downloadsTitle", { number: String(loaderData.number) }),
    },
    { name: "robots", content: "noindex" },
  ];
}

/** The downloads email's page: a paid order's files, by the link's own secret. */
export async function loader({ params, context }: Route.LoaderArgs) {
  const found = await getDownloadsByLink(requireStore(context), params.token);
  if (!found) throw data("Not found", { status: 404 });
  return found;
}

export default function Downloads({ loaderData, params }: Route.ComponentProps) {
  const t = useT();
  const [search] = useSearchParams();
  const { number, name, downloads } = loaderData;
  return (
    <div className="mx-auto grid max-w-xl gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("storefront.downloadsTitle", { number: String(number) })}
        </h1>
        <p>{t("storefront.downloadsIntro", { name })}</p>
      </div>
      <RefusedDownload reason={search.get("refused")} />
      <DownloadList
        downloads={downloads}
        href={(id) => href("/downloads/:token/:id", { token: params.token, id })}
      />
      <p className="text-sm text-muted-foreground">{t("storefront.downloadsHelp")}</p>
    </div>
  );
}
