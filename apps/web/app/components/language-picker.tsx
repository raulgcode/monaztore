import { type Locale, localeNames, locales } from "@monaztore/i18n";
import { useState } from "react";
import { href, useFetcher, useLocation } from "react-router";
import { useLocale, useT } from "~/lib/i18n";
import { Button } from "./ui/button";

/**
 * The language, picked in Settings: until then the browser's language decides. Each option is
 * named in itself, so whoever can't read the current one still finds theirs. Saved in a cookie
 * (and the owner's account) so the server renders the right one. Without `titled`, the page's own
 * title says what it is: the legend stays for screen readers only.
 */
export function LanguagePicker({ titled = true }: { titled?: boolean }) {
  const fetcher = useFetcher();
  const location = useLocation();
  const locale = useLocale();
  const t = useT();
  // Shows the pick at once; the page comes back in that language after the save.
  const [selected, setSelected] = useState<Locale>(locale);
  const [lastLocale, setLastLocale] = useState(locale);
  if (lastLocale !== locale) {
    setLastLocale(locale);
    setSelected(locale);
  }

  return (
    <fetcher.Form
      method="post"
      action={href("/locale")}
      // Applies the language as soon as it is picked; the button covers no-JS.
      onChange={(event) => fetcher.submit(event.currentTarget)}
      className="grid gap-4"
    >
      <input type="hidden" name="redirectTo" value={location.pathname + location.search} />
      <fieldset className="grid gap-2" aria-describedby={titled ? "language-intro" : undefined}>
        <legend className={titled ? "mb-1 text-sm font-medium" : "sr-only"}>
          {t("common.languageLegend")}
        </legend>
        {titled ? (
          <p id="language-intro" className="mb-1 text-sm text-muted-foreground">
            {t("common.languageIntro")}
          </p>
        ) : null}
        {locales.map((option) => (
          <label
            key={option}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border p-3 has-[:checked]:border-ring has-[:checked]:bg-nav-active has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
          >
            <input
              type="radio"
              name="locale"
              value={option}
              checked={selected === option}
              onChange={() => setSelected(option)}
              className="size-4 accent-primary"
            />
            <span lang={option} className="font-medium">
              {localeNames[option]}
            </span>
          </label>
        ))}
      </fieldset>
      <Button
        type="submit"
        variant="secondary"
        className="justify-self-start"
        disabled={fetcher.state !== "idle"}
      >
        {t("common.languageSave")}
      </Button>
    </fetcher.Form>
  );
}
