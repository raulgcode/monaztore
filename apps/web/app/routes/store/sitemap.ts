import { getStoreInfo, sitemapEntries } from "@monaztore/core";
import { storeContext } from "~/context";
import { storeOrigin } from "~/lib/store-seo";
import type { Route } from "./+types/sitemap";

const escapeXml = (value: string) => value.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Every public page of the store, for search engines. The platform's host has none yet. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const store = context.get(storeContext);
  const urls: string[] = [];
  if (store) {
    const [info, entries] = await Promise.all([getStoreInfo(store), sitemapEntries(store)]);
    const origin = storeOrigin(info.canonicalHost, request.url);
    urls.push(`<url><loc>${escapeXml(`${origin}/`)}</loc></url>`);
    for (const entry of entries) {
      urls.push(
        `<url><loc>${escapeXml(`${origin}${encodeURI(entry.path)}`)}</loc><lastmod>${entry.updatedAt.toISOString()}</lastmod></url>`,
      );
    }
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>\n`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
