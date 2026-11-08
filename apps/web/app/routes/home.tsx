import { getStoreInfo, getStoreTheme, listStoreProducts } from "@monaztore/core";
import { href, Link } from "react-router";
import { StandalonePage } from "~/components/standalone-page";
import { StoreHome } from "~/components/storefront/store-home";
import { buttonVariants } from "~/components/ui/button";
import { storeContext } from "~/context";
import { metaT, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { auth } from "~/lib/services.server";
import { pageMeta, storeOrigin } from "~/lib/store-seo";
import type { Route } from "./+types/home";

export function meta({ loaderData, matches }: Route.MetaArgs) {
  const t = metaT(matches);
  if (loaderData?.kind === "store") {
    return pageMeta({
      title: loaderData.storeName,
      description: loaderData.description || t("storefront.featured"),
      canonical: `${loaderData.origin}/`,
      image: loaderData.heroImageUrl,
      siteName: loaderData.storeName,
    });
  }
  return [{ title: t("home.title") }, { name: "description", content: t("home.description") }];
}

/** On a store's domain, the store's front page; on the platform's host, the platform's landing. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const store = context.get(storeContext);
  if (store) {
    const theme = await getStoreTheme(store);
    const { sections, homeProducts } = theme.layout;
    const [info, latest, sale] = await Promise.all([
      getStoreInfo(store),
      listStoreProducts(store, {}, homeProducts),
      sections.includes("sale") ? listStoreProducts(store, { onSale: true }, 4) : null,
    ]);
    return {
      kind: "store" as const,
      storeName: info.name,
      currency: info.currency,
      origin: storeOrigin(info.canonicalHost, request.url),
      products: latest.products,
      total: latest.total,
      sale: sale?.products ?? [],
      description: theme.heroSubtitle,
      heroImageUrl: theme.heroImageUrl,
    };
  }
  const session = await auth.api.getSession({ headers: request.headers });
  return {
    kind: "platform" as const,
    signedIn: Boolean(session),
    i18n: translations(context, "home"),
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return loaderData.kind === "store" ? (
    <StoreHome {...loaderData} />
  ) : (
    <PlatformHome signedIn={loaderData.signedIn} />
  );
}

/** The platform's front door: replace it with your project's landing. */
function PlatformHome({ signedIn }: { signedIn: boolean }) {
  const t = useT();
  return (
    <StandalonePage>
      <div className="grid gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">{t("home.heading")}</h1>
        <p className="text-lg text-muted-foreground">{t("home.intro")}</p>
        <Link
          to={signedIn ? href("/app") : href("/login")}
          className={buttonVariants({ className: "justify-self-start" })}
        >
          {signedIn ? t("home.openApp") : t("home.signIn")}
        </Link>
      </div>
    </StandalonePage>
  );
}
