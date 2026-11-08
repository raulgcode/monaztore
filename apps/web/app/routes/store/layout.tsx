import { isRouteErrorResponse, Outlet, useRouteLoaderData } from "react-router";
import { ErrorPage } from "~/components/error-page";
import { StoreShell } from "~/components/storefront/store-shell";
import { storeContext } from "~/context";
import { useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { storeShell } from "~/lib/storefront.server";
import { storeMiddleware } from "~/middleware/store.server";
import type { Route } from "./+types/layout";

/**
 * The public pages: on a store's domain they get the store's frame; on the platform's own host,
 * the landing and nothing else.
 */
export const middleware: Route.MiddlewareFunction[] = [storeMiddleware];

export async function loader({ request, context }: Route.LoaderArgs) {
  const store = context.get(storeContext);
  if (!store) return { shell: null };
  return { shell: await storeShell(store, request), i18n: translations(context, "storefront") };
}

export default function StoreLayout({ loaderData }: Route.ComponentProps) {
  if (!loaderData.shell) return <Outlet />;
  return (
    <StoreShell name={loaderData.shell.name} collections={loaderData.shell.collections}>
      <Outlet />
    </StoreShell>
  );
}

/** A product that no longer exists still shows the store around the message. */
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const t = useT();
  const layout = useRouteLoaderData<typeof loader>("routes/store/layout");
  const status = isRouteErrorResponse(error) ? error.status : undefined;
  const stack = import.meta.env.DEV && error instanceof Error ? error.stack : undefined;
  const heading = status === 404 ? t("common.notFoundTitle") : t("common.errorTitle");
  // An error page has no route meta: React 19 hoists these into <head>.
  const head = (
    <>
      <title>{layout?.shell ? `${heading} | ${layout.shell.name}` : heading}</title>
      <meta name="robots" content="noindex" />
    </>
  );
  if (!layout?.shell) {
    return (
      <>
        {head}
        <ErrorPage t={t} status={status} stack={stack} />
      </>
    );
  }
  return (
    <StoreShell name={layout.shell.name} collections={layout.shell.collections}>
      {head}
      <div className="py-10 text-center">
        <h1 className="text-2xl font-semibold">{heading}</h1>
        <p className="mt-3 text-muted-foreground">
          {status === 404 ? t("common.notFoundDetails") : t("common.errorDetails")}
        </p>
      </div>
    </StoreShell>
  );
}
