import type { Locale } from "@monaztore/i18n";

/**
 * Where a currency's prices are written, so they read as they do on that country's price tags:
 * colones in Spanish are "₡3 200" (Costa Rica), not "3200 ₡" (Spain's way).
 */
const currencyRegions: Record<string, string> = { CRC: "CR" };

/**
 * A price kept in minor units (two digits: céntimos, cents) as the shopper reads it:
 * `formatPrice(1_250_000, "CRC", "es")` → "₡12 500". Whole amounts drop the decimals.
 */
export function formatPrice(minor: number, currency: string, locale: Locale): string {
  const amount = minor / 100;
  const whole = Number.isInteger(amount);
  const region = currencyRegions[currency];
  return new Intl.NumberFormat(region ? `${locale}-${region}` : locale, {
    style: "currency",
    currency,
    // "₡12,500", not "CRC 12,500": shoppers read the sign they see on price tags.
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
