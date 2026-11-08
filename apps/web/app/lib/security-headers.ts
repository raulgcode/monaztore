/**
 * Hosts a form may send the browser to after a POST (Chrome checks `form-action` on the
 * redirect too): Google sign-in. A new one (a payment page) goes here with its reason.
 */
const formTargets = ["https://accounts.google.com"];

/**
 * Paths that carry a secret in the URL (a reset token, an emailed link): they never travel as a
 * Referer and search engines don't keep them. A new emailed link goes here.
 */
const secretPaths = ["/reset-password"];

export interface SecurityHeaderOptions {
  /** Changes on every page; React Router puts it on its own inline scripts. */
  nonce: string;
  /** The production build: CSP on (Vite's dev server injects scripts without nonce). */
  production: boolean;
  /** Served over HTTPS (APP_URL): HSTS, and any http:// asset is fetched over https. */
  https: boolean;
  pathname: string;
}

/** The Content-Security-Policy of an HTML page: only our own scripts, never inside a frame. */
export function contentSecurityPolicy(nonce: string, { https = true } = {}): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    // React sets `style` attributes; no inline <style> of ours.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self' ${formTargets.join(" ")}`,
    "frame-ancestors 'none'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/** Headers for every response of the web app, pages and resource routes alike. */
export function securityHeaders({
  nonce,
  production,
  https,
  pathname,
}: SecurityHeaderOptions): [string, string][] {
  const secret = secretPaths.some((path) => pathname.startsWith(path));
  const headers: [string, string][] = [
    ["X-Content-Type-Options", "nosniff"],
    ["X-Frame-Options", "DENY"],
    ["Referrer-Policy", secret ? "no-referrer" : "strict-origin-when-cross-origin"],
    // Nothing that the app doesn't use: add `camera=(self)` the day a screen scans a code.
    [
      "Permissions-Policy",
      "camera=(), geolocation=(), microphone=(), payment=(), usb=(), interest-cohort=()",
    ],
    ["Cross-Origin-Opener-Policy", "same-origin"],
  ];
  if (secret) headers.push(["X-Robots-Tag", "noindex, nofollow"]);
  if (production && https) {
    headers.push(["Strict-Transport-Security", "max-age=31536000; includeSubDomains"]);
  }
  if (production) {
    headers.push(["Content-Security-Policy", contentSecurityPolicy(nonce, { https })]);
  }
  return headers;
}
