import { DEFAULT_STORE_LOCALE, resolveOnlyStore, resolveStoreByHost } from "@monaztore/core";
import { parseLocale } from "@monaztore/i18n";
import { data, type MiddlewareFunction, type RouterContextProvider } from "react-router";
import { localeContext, storeContext } from "~/context";
import { readLocaleCookie } from "~/lib/locale.server";
import { db, env } from "~/lib/services.server";

/**
 * Finds the store that answers at this Host (`resolveStoreByHost`, the one public entry point that
 * picks a store). On the platform's own host there is none, and the pages show the landing. A
 * standalone instance (`STORE_MODE=single`) is its one store on every host.
 *
 * A store speaks its own language (`store_settings.locale`, Spanish until the owner picks), not
 * the browser's: only a language the shopper picked at the foot of the store (the `lang` cookie,
 * which belongs to the store's host) comes before it.
 */
export const storeMiddleware: MiddlewareFunction<Response> = async ({ request, context }) => {
  const host = request.headers.get("Host") ?? new URL(request.url).host;
  const store =
    (await resolveStoreByHost(db, host)) ??
    (env.STORE_MODE === "single" ? await resolveOnlyStore(db, host) : undefined);
  context.set(storeContext, store ? { db, store } : null);
  if (store && !(await readLocaleCookie(request))) {
    context.set(
      localeContext,
      parseLocale(store.locale) ?? parseLocale(DEFAULT_STORE_LOCALE) ?? "es",
    );
  }
};

/** For pages that only exist in a store (a product, a collection): 404 elsewhere. */
export function requireStore(context: Readonly<RouterContextProvider>) {
  const store = context.get(storeContext);
  if (!store) throw data("Not a store", { status: 404 });
  return store;
}
