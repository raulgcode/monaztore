import { href, useLocation } from "react-router";
import { Logo } from "~/components/logo";
import { Button } from "~/components/ui/button";
import { ScrollShadow } from "~/components/ui/scroll-shadow";
import type { T } from "~/lib/i18n";

/**
 * What a person sees when a page fails or doesn't exist: a kind message and a way out. `t` comes
 * from the error boundary, which may render without the root's loader data. Its links reload the
 * whole document: after an error, whatever the app held in memory is suspect.
 */
export function ErrorPage({
  t,
  status,
  stack,
}: {
  t: T;
  /** The HTTP status of a thrown response; none for an unexpected error. */
  status?: number;
  /** Only in development. */
  stack?: string;
}) {
  const { pathname, search } = useLocation();
  const notFound = status === 404;
  const home = href("/");

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6 sm:max-w-lg">
      <header>
        <a
          href={home}
          className="inline-block rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Logo name={t("common.appName")} />
        </a>
      </header>
      <main className="flex flex-1 flex-col">
        <div className="my-auto flex flex-col items-center py-10 text-center sm:mt-auto sm:mb-0">
          {status ? (
            <p className="text-sm font-medium text-muted-foreground">
              {t("common.errorStatus", { status: String(status) })}
            </p>
          ) : null}
          <h1 className="mt-2 text-2xl font-semibold text-balance">
            {notFound ? t("common.notFoundTitle") : t("common.errorTitle")}
          </h1>
          <p className="mt-3 text-pretty text-muted-foreground">
            {notFound ? t("common.notFoundDetails") : t("common.errorDetails")}
          </p>
        </div>
        {/* Thumb reach on a phone: the buttons sit at the bottom; on a wider screen, under the text. */}
        <div className="flex flex-col gap-3 sm:mb-auto sm:flex-row-reverse sm:justify-center">
          {notFound ? (
            <Button asChild size="lg">
              <a href={home}>{t("common.errorHome")}</a>
            </Button>
          ) : (
            <>
              {/* A full reload: a failed form (POST) comes back as the page itself (GET). */}
              <Button asChild size="lg">
                <a href={`${pathname}${search}`}>{t("common.errorRetry")}</a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href={home}>{t("common.errorHome")}</a>
              </Button>
            </>
          )}
        </div>
        {stack ? (
          <ScrollShadow className="mt-8 text-left text-xs">
            <pre className="w-max min-w-full p-4">
              <code>{stack}</code>
            </pre>
          </ScrollShadow>
        ) : null}
      </main>
    </div>
  );
}
