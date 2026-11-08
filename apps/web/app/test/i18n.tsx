// For browser tests only: the root loader data a page gets in each language. Never imported by the
// app itself, so the dictionaries stay out of the bundle.
import type { Locale } from "@monaztore/i18n";
import { dictionaries, type Namespace } from "@monaztore/i18n/messages";
import type { ReactNode } from "react";
import { createRoutesStub } from "react-router";
import { render } from "vitest-browser-react";

export function translatedRoot<T extends object>(
  locale: Locale = "en",
  data: T = {} as T,
  namespaces: Namespace[] = ["common"],
) {
  const i18n = Object.fromEntries(namespaces.map((ns) => [ns, dictionaries[locale][ns]]));
  return { ...data, locale, i18n };
}

/** Renders a component that translates, as a page that loaded `namespaces` in `locale` would. */
export function renderTranslated(
  ui: ReactNode,
  { locale = "en", namespaces = [] }: { locale?: Locale; namespaces?: Namespace[] } = {},
) {
  const Stub = createRoutesStub([
    {
      id: "root",
      path: "/",
      loader: () => translatedRoot(locale, {}, ["common", ...namespaces]),
      HydrateFallback: () => null,
      Component: () => ui,
    },
  ]);
  return render(<Stub />);
}
