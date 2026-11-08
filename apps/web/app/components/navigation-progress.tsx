import { LoaderCircleIcon } from "lucide-react";
import { useNavigation } from "react-router";
import { useT } from "~/lib/i18n";

// Shown before any loader ran (the first navigation of a page that failed to load).
const fallback = { common: { loading: "Loading…" } };

/** True while React Router loads the next page or submits a navigating <Form>. */
export function useIsNavigating(): boolean {
  return useNavigation().state !== "idle";
}

/**
 * What a person sees while the next page loads, so a tap never looks ignored: a bar at the top
 * in the brand's color that grows toward 90 %, and, if it takes longer, a "Loading…" pill under
 * it. Both wait (~150 ms and ~500 ms) so fast pages don't flicker. Pure CSS (app.css), no timers.
 * Screen readers hear "Loading…" from a polite live region.
 *
 * `scope`: the root draws one for every page; a storefront draws its own inside its frame, so it
 * takes the store's colors, and the root's steps aside (app.css).
 */
export function NavigationProgress({ scope = "root" }: { scope?: "root" | "store" }) {
  const busy = useIsNavigating();
  const t = useT(fallback);

  return (
    <div data-navigation-scope={scope} className="contents">
      <div
        aria-hidden
        data-navigation-progress={busy ? "loading" : "idle"}
        className="navigation-progress pointer-events-none fixed inset-x-0 top-0 z-[60] h-1"
      >
        {busy ? (
          <div className="navigation-progress-bar h-full bg-primary shadow-[0_0_8px_var(--primary)]" />
        ) : null}
      </div>
      {busy ? (
        <div
          aria-hidden
          className="navigation-progress-pill pointer-events-none fixed top-3 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-md"
        >
          <LoaderCircleIcon className="size-4 animate-spin text-primary motion-reduce:animate-none" />
          {t("common.loading")}
        </div>
      ) : null}
      <p role="status" aria-live="polite" className="sr-only">
        {busy ? t("common.loading") : ""}
      </p>
    </div>
  );
}
