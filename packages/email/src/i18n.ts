import { createTranslator, defaultLocale, type Locale } from "@monaztore/i18n";
import { dictionaries, type Messages } from "@monaztore/i18n/messages";

/** Emails are written on the server, so they read the whole dictionary of the recipient's language. */
export function emailT(locale: Locale = defaultLocale) {
  return createTranslator<Messages>(locale, dictionaries[locale]);
}

/** "5 de noviembre de 2026" / "November 5, 2026", in UTC so every server prints the same day. */
export function emailDate(locale: Locale, date: Date): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(date);
}
