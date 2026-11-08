import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { href, useFetcher, useFetchers, useLocation, useRouteLoaderData } from "react-router";
import { useT } from "~/lib/i18n";
import { nextTheme, parseTheme, type Theme, themeLabels } from "~/lib/theme";
import { Button } from "./ui/button";

export const THEME_FETCHER = "theme";

/** The saved theme, or the one being saved right now so the page switches instantly. */
export function useTheme(): Theme {
  const saved = useRouteLoaderData<{ theme: Theme }>("root")?.theme ?? "system";
  const pending = useFetchers().find((fetcher) => fetcher.key === THEME_FETCHER)?.formData;
  return pending ? parseTheme(pending.get("theme")) : saved;
}

/** Cycles Sistema → Claro → Oscuro. Saved in a cookie so the server renders the right theme. */
export function ThemeToggle({ className }: { className?: string }) {
  const fetcher = useFetcher({ key: THEME_FETCHER });
  const location = useLocation();
  const theme = useTheme();
  const next = nextTheme(theme);
  const t = useT();
  const current = t(themeLabels[theme]);

  return (
    <fetcher.Form method="post" action={href("/theme")} className={className}>
      <input type="hidden" name="redirectTo" value={location.pathname + location.search} />
      <Button
        type="submit"
        name="theme"
        value={next}
        variant="ghost"
        size="icon"
        aria-label={t("common.themeSwitch", {
          theme: current,
          next: t(themeLabels[next]).toLowerCase(),
        })}
        title={t("common.themeCurrent", { theme: current })}
      >
        <ThemeIcon theme={theme} />
      </Button>
    </fetcher.Form>
  );
}

const icons = { system: MonitorIcon, light: SunIcon, dark: MoonIcon } satisfies Record<
  Theme,
  unknown
>;

function ThemeIcon({ theme }: { theme: Theme }) {
  const Icon = icons[theme];
  return <Icon aria-hidden className="size-5" data-icon={theme} />;
}
