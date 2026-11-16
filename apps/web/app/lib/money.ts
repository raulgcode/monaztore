export { formatPrice } from "@monaztore/contracts/price-format";

/** The amount as schema.org and payment providers write it: `"12500.00"`. */
export function decimalPrice(minor: number): string {
  return (minor / 100).toFixed(2);
}

/** How much is taken off, rounded down to a whole percent; null when it isn't on sale. */
export function percentOff(price: number | null, compareAtPrice: number | null): number | null {
  if (price === null || compareAtPrice === null || compareAtPrice <= price) return null;
  const percent = Math.floor(((compareAtPrice - price) / compareAtPrice) * 100);
  return percent > 0 ? percent : null;
}
