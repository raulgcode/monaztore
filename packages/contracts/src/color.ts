/**
 * Colors as `#rrggbb`, and what a store's brand color needs to be readable: WCAG 2.x contrast,
 * mixing and nudging a color until it reaches AA on the page's background.
 */

export const hexColorPattern = /^#[0-9a-f]{6}$/i;

/** `#ABC`, `abc123` or `#AbC123` as `#aabbcc`; undefined when it isn't a color. */
export function normalizeHex(value: string): string | undefined {
  const raw = value.trim().replace(/^#/, "").toLowerCase();
  const full = /^[0-9a-f]{3}$/.test(raw)
    ? raw
        .split("")
        .map((c) => c + c)
        .join("")
    : raw;
  return /^[0-9a-f]{6}$/.test(full) ? `#${full}` : undefined;
}

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function luminance(hex: string): number {
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = channels(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2.x contrast ratio between two `#rrggbb` colors, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** `a` moved `amount` (0–1) of the way to `b`. */
export function mixColors(a: string, b: string, amount: number): string {
  const [x, y] = [channels(a), channels(b)];
  return toHex(x.map((c, i) => c + ((y[i] ?? c) - c) * amount) as [number, number, number]);
}

/**
 * `color`, darkened or lightened (toward black on a light background, white on a dark one) only
 * as much as it takes to reach `ratio` against `background`.
 */
export function ensureContrast(color: string, background: string, ratio = 4.5): string {
  if (contrastRatio(color, background) >= ratio) return color;
  const target = luminance(background) > 0.18 ? "#000000" : "#ffffff";
  for (let step = 1; step <= 40; step++) {
    const candidate = mixColors(color, target, step / 40);
    if (contrastRatio(candidate, background) >= ratio) return candidate;
  }
  return target;
}

/** The text color (near-black or white) that reads best on `background`. */
export function readableOn(background: string, dark = "#18181b", light = "#ffffff"): string {
  return contrastRatio(dark, background) >= contrastRatio(light, background) ? dark : light;
}
