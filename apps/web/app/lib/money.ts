import type { Locale } from "@monaztore/i18n";

/**
 * A price kept in minor units (two digits: céntimos, cents) as the shopper reads it:
 * `formatPrice(1_250_000, "CRC", "es")` → "₡12 500". Whole amounts drop the decimals.
 */
export function formatPrice(minor: number, currency: string, locale: Locale): string {
  const amount = minor / 100;
  const whole = Number.isInteger(amount);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    // "₡12,500", not "CRC 12,500": shoppers read the sign they see on price tags.
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** The amount as schema.org and payment providers write it: `"12500.00"`. */
export function decimalPrice(minor: number): string {
  return (minor / 100).toFixed(2);
}
