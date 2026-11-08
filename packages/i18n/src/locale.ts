export const locales = ["en", "es"] as const;
export type Locale = (typeof locales)[number];

/** English is the source language: every text is written in English first. */
export const defaultLocale: Locale = "en";

/** What a browser in a language we don't speak gets: the source language. */
export const fallbackLocale: Locale = defaultLocale;

/** Each language named in itself, for the language picker. */
export const localeNames = {
  en: "English",
  es: "Español",
} as const satisfies Record<Locale, string>;

/**
 * The language a tag falls back to when its region isn't one of ours: `es-MX` → `es`. A new
 * language goes in `locales`, here and in `messages/` (see AGENTS.md, "Languages").
 */
const byLanguage: Record<string, Locale> = { es: "es", en: "en" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/** `es`, `es-MX`, `en_us`… → the supported language, or undefined. */
export function parseLocale(value: unknown): Locale | undefined {
  if (typeof value !== "string") return undefined;
  const [language = "", region = ""] = value.trim().toLowerCase().split(/[-_]/);
  const exact = locales.find((locale) => locale.toLowerCase() === `${language}-${region}`);
  return exact ?? byLanguage[language];
}

/** The best supported language in an `Accept-Language` header, by its `q` weights. */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale | undefined {
  if (!acceptLanguage) return undefined;
  const ranked = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((param) => param.trim()).find((param) => param.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { locale: parseLocale(tag), weight: Number.isNaN(weight) ? 0 : weight, index };
    })
    .filter((entry) => entry.locale && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  return ranked[0]?.locale;
}

export interface LocaleSources {
  /** The `lang` cookie: what the person picked on this device. */
  cookie?: unknown;
  /** `user.locale`: what a signed-in person picked on any device. */
  user?: unknown;
  /** The browser's `Accept-Language` header. */
  acceptLanguage?: string | null;
}

/** The first that exists wins: the cookie, the account, the browser, then English. */
export function resolveLocale({ cookie, user, acceptLanguage }: LocaleSources): Locale {
  return (
    parseLocale(cookie) ?? parseLocale(user) ?? negotiateLocale(acceptLanguage) ?? fallbackLocale
  );
}
