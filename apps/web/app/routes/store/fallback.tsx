import { findRedirect } from "@monaztore/core";
import { data, redirect } from "react-router";
import { storeContext } from "~/context";
import { safeRedirect } from "~/lib/safe-redirect";
import type { Route } from "./+types/fallback";

/**
 * Any address no other route answers. In a store, an old address of the shop it migrated from
 * (`/producto/taza/`) moves for good to its new one; everything else is a 404.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const store = context.get(storeContext);
  if (store) {
    const url = new URL(request.url);
    let path: string;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      path = url.pathname;
    }
    const to = await findRedirect(store, path);
    if (to) throw redirect(safeRedirect(`${to}${url.search}`), 301);
  }
  throw data("Not found", { status: 404 });
}

// Never rendered: the loader always redirects or throws. Being a page, its 404 shows the
// layout's error boundary instead of a bare response.
export default function Fallback() {
  return null;
}
