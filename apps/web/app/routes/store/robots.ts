import { getStoreInfo } from "@monaztore/core";
import { storeContext } from "~/context";
import { storeOrigin } from "~/lib/store-seo";
import type { Route } from "./+types/robots";

/** Search engines may read the store; never the workspace, sign-in or the API. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const store = context.get(storeContext);
  const lines = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /app",
    "Disallow: /api",
    "Disallow: /login",
  ];
  if (store) {
    const info = await getStoreInfo(store);
    lines.push("", `Sitemap: ${storeOrigin(info.canonicalHost, request.url)}/sitemap.xml`);
  }
  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
