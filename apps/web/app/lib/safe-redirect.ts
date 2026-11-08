// Any origin works as the base: only whether the result stays on it matters.
const base = new URL("https://app.invalid");

/**
 * A path on this site, or `fallback`. Parsed the way the browser will read it, so tricks like
 * `/\evil.com` or `/<tab>/evil.com` (which browsers turn into `//evil.com`) can't leave the site.
 */
export function safeRedirect(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || !value.startsWith("/")) return fallback;
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return fallback;
  }
  if (url.origin !== base.origin) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
