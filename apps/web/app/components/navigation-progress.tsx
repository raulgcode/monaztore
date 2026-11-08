import { useNavigation } from "react-router";
import { useT } from "~/lib/i18n";

// Shown before any loader ran (the first navigation of a page that failed to load).
const fallback = { common: { loading: "Loading…" } };

/** True while React Router loads the next page or submits a navigating <Form>. */
export function useIsNavigating(): boolean {
  return useNavigation().state !== "idle";
}

/**
 * Thin bar at the top of the screen while the next page loads, in the brand color. It only
 * appears if loading takes longer than ~150 ms, so fast navigations don't flicker, and grows
 * slowly toward 90% until the page arrives. Pure CSS (app.css), no timers, no extra JS.
 * Screen readers hear "Loading…" from a polite live region.
 */
export function NavigationProgress() {
  const busy = useIsNavigating();
  const t = useT(fallback);

  return (
    <>
      <div
        aria-hidden
        data-navigation-progress={busy ? "loading" : "idle"}
        className="navigation-progress pointer-events-none fixed inset-x-0 top-0 z-[60] h-1"
      >
        {busy ? <div className="navigation-progress-bar h-full bg-primary" /> : null}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {busy ? t("common.loading") : ""}
      </p>
    </>
  );
}
