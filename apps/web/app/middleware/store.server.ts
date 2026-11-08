import { resolveStoreByHost } from "@monaztore/core";
import { data, type MiddlewareFunction, type RouterContextProvider } from "react-router";
import { storeContext } from "~/context";
import { db } from "~/lib/services.server";

/**
 * Finds the store that answers at this Host (`resolveStoreByHost`, the one public entry point that
 * picks a store). On the platform's own host there is none, and the pages show the landing.
 */
export const storeMiddleware: MiddlewareFunction<Response> = async ({ request, context }) => {
  const host = request.headers.get("Host") ?? new URL(request.url).host;
  const store = await resolveStoreByHost(db, host);
  context.set(storeContext, store ? { db, store } : null);
};

/** For pages that only exist in a store (a product, a collection): 404 elsewhere. */
export function requireStore(context: Readonly<RouterContextProvider>) {
  const store = context.get(storeContext);
  if (!store) throw data("Not a store", { status: 404 });
  return store;
}
