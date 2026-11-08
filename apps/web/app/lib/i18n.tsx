import {
  createTranslator,
  defaultLocale,
  type Locale,
  type MessageKey,
  type Namespace,
  type ParamsArg,
  splitRich,
  type Translator,
} from "@monaztore/i18n";
// Types only: the dictionaries themselves never reach the browser bundle.
import type { Messages } from "@monaztore/i18n/messages";
import { Fragment, type ReactNode } from "react";
import { useMatches } from "react-router";

type Key = MessageKey<Messages>;

/** What a loader returns to be translated: `{ i18n: translations(context, "settings") }`. */
interface TranslatedData {
  locale?: Locale;
  i18n?: Record<string, Namespace>;
}

export type T = Translator<Messages>;

const data = (loaderData: unknown) => (loaderData ?? {}) as TranslatedData;

/** The page's language, as the root loader decided it. */
export function useLocale(): Locale {
  const root = useMatches().find((match) => match.id === "root");
  return data(root?.loaderData).locale ?? defaultLocale;
}

interface Match {
  id: string;
  loaderData?: unknown;
}

function translator(matches: readonly Match[], fallback?: Record<string, Namespace>): T {
  const locale = data(matches.find((match) => match.id === "root")?.loaderData).locale;
  const loaded = matches.map((match) => data(match.loaderData).i18n);
  const messages: Record<string, Namespace> = Object.assign({}, fallback, ...loaded);
  return createTranslator<Messages>(locale ?? defaultLocale, messages);
}

/**
 * Translates with every namespace the matched routes loaded: the root sends `common` and each
 * route its own, so shared components need no props to translate. `fallback` covers pages that
 * render without loader data (an error thrown by a middleware before the loaders ran).
 */
export function useT(fallback?: Record<string, Namespace>): T {
  return translator(useMatches(), fallback);
}

/** `t` for a route's `meta`: `metaT(matches)("home.title")`. */
export function metaT(matches: readonly (Match | undefined)[]): T {
  return translator(matches.filter((match) => match !== undefined));
}

/**
 * A text with tags, each rendered by its function:
 * `richText(t, "billing.terms", { terms: (text) => <Link to="…">{text}</Link> })`.
 * Separate from `t` so pages without tagged texts don't ship it.
 */
export function richText<K extends Key>(
  t: T,
  key: K,
  renderers: Record<string, (chunk: string) => ReactNode>,
  ...params: ParamsArg<Messages, K>
): ReactNode {
  const text = (t as (key: string, params?: object) => string)(key, params[0]);
  return splitRich(text, renderers).map((part, index) => (
    <Fragment key={index}>{typeof part === "string" ? part : part.node}</Fragment>
  ));
}

/**
 * A text that may be a key, like a validation error from `@monaztore/contracts`. One that isn't a
 * key (a plain text) comes back as it is.
 */
export function translateText(t: T, text: string): string {
  return (t as (key: string) => string)(text);
}
