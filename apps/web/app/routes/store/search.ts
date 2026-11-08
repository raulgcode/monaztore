import { SUGGEST_MIN_LENGTH, suggestStoreProducts } from "@monaztore/core";
import { requireStore } from "~/middleware/store.server";
import type { Route } from "./+types/search";

/** Longer than any product name worth matching: the rest is ignored. */
const MAX_QUERY = 80;

/**
 * The search box's suggestions (`/search?q=cami`): a few products with a small photo, as JSON
 * for its fetcher. Without JavaScript the box is a plain form to `/products?q=`, so nobody needs
 * this page; it answers search engines with `noindex`.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const store = requireStore(context);
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY);
  const products = q.length >= SUGGEST_MIN_LENGTH ? await suggestStoreProducts(store, q) : [];
  return Response.json(
    { q, products },
    {
      headers: {
        // The catalog changes rarely: a shopper typing the same letters again gets it from cache.
        "Cache-Control": "public, max-age=60",
        "X-Robots-Tag": "noindex",
      },
    },
  );
}
