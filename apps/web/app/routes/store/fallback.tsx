import { isLandingPage } from "@monaztore/contracts";
import { findRedirect, getStoreInfo, getStorePage, pagePath, plainText } from "@monaztore/core";
import { data, redirect } from "react-router";
import { faqJsonLd, PageBlocks } from "~/components/pages/page-blocks";
import { storeContext } from "~/context";
import { inquiryAction, inquiryFormContext } from "~/lib/inquiries.server";
import { safeRedirect } from "~/lib/safe-redirect";
import { pageMeta, storeOrigin } from "~/lib/store-seo";
import type { Route } from "./+types/fallback";

/** `/sobre-nosotros` or `/sobre-nosotros/` → `sobre-nosotros`: the shape of a page's address. */
function pageSlugOfPath(path: string): string | null {
  const match = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(path);
  return match?.[1] ?? null;
}

/**
 * Any address no other route answers. In a store, one of its pages (`/sobre-nosotros`), or an
 * old address of the shop it migrated from (`/producto/taza/`), which moves for good to its new
 * one; everything else is a 404.
 */
export async function loader({ request, url, context }: Route.LoaderArgs) {
  const store = context.get(storeContext);
  if (!store) throw data("Not found", { status: 404 });
  // `url` is the page's address even when the browser asks for its data (`/<slug>.data`).
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    path = url.pathname;
  }

  const slug = pageSlugOfPath(path);
  if (slug) {
    const [page, info] = await Promise.all([getStorePage(store, slug), getStoreInfo(store)]);
    if (page) {
      // The front page has one address: the store's own.
      if (page.isHome) throw redirect(`/${url.search}`, 301);
      // WordPress wrote addresses with a trailing slash: one address per page.
      if (path.endsWith("/")) throw redirect(`${pagePath(slug)}${url.search}`, 301);
      const firstText = page.blocks.find((block) => block.type === "text");
      return {
        page,
        form: inquiryFormContext(page.blocks),
        currency: info.currency,
        storeName: info.name,
        canonical: `${storeOrigin(info.canonicalHost, request.url)}${pagePath(page.slug)}`,
        summary: firstText?.type === "text" ? plainText(firstText.html) : "",
        image:
          page.blocks.flatMap((block) =>
            block.type === "image" && block.url ? [block.url] : [],
          )[0] ?? null,
      };
    }
  }

  const to = await findRedirect(store, path);
  if (to) throw redirect(safeRedirect(`${to}${url.search}`), 301);
  throw data("Not found", { status: 404 });
}

/** A request sent from one of the page's form blocks. */
export async function action({ request, url, context }: Route.ActionArgs) {
  const store = context.get(storeContext);
  if (!store) throw data("Not found", { status: 404 });
  // `url`, not `request.url`: a fetcher's post goes to `/<slug>.data`.
  const slug = pageSlugOfPath(url.pathname);
  const formData = await request.formData();
  if (!slug || formData.get("intent") !== "inquiry") throw data("Not found", { status: 404 });
  return inquiryAction(request, store, slug, formData);
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [];
  const { page, storeName, canonical, summary, image } = loaderData;
  const faq = faqJsonLd(page.blocks);
  return [
    ...pageMeta({
      title: page.seoTitle || `${page.title} | ${storeName}`,
      description: page.seoDescription || summary || page.title,
      canonical,
      image,
      siteName: storeName,
    }),
    ...(faq ? [faq] : []),
  ];
}

/** A store's page; any other address redirects or throws before it renders. */
export default function StorePage({ loaderData }: Route.ComponentProps) {
  const { page, currency, form } = loaderData;
  // A landing opens with its hero, which holds the page's h1.
  if (isLandingPage(page.blocks)) {
    return (
      <article>
        <PageBlocks
          blocks={page.blocks}
          products={page.products}
          currency={currency}
          form={form ?? undefined}
          landing
        />
      </article>
    );
  }
  return (
    <article className="mx-auto grid max-w-3xl gap-6">
      <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">{page.title}</h1>
      <PageBlocks
        blocks={page.blocks}
        products={page.products}
        currency={currency}
        form={form ?? undefined}
      />
    </article>
  );
}
