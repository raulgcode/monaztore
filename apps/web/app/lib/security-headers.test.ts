import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "./security-headers";

const headersOf = (pathname: string, production = true, https = true) =>
  new Map(securityHeaders({ nonce: "abc123", production, https, pathname }));

describe("securityHeaders", () => {
  it("keeps the app out of other sites' frames and the browser from guessing types", () => {
    const headers = headersOf("/app/acme-x1");

    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
  });

  it("only runs our scripts and the page's nonce", () => {
    const policy = contentSecurityPolicy("abc123");

    expect(policy).toContain("script-src 'self' 'nonce-abc123'");
    expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(policy).toContain("object-src 'none'");
  });

  it("lets forms go on to Google sign-in", () => {
    expect(contentSecurityPolicy("n")).toContain("form-action 'self' https://accounts.google.com");
  });

  it("turns off the camera, the location and the microphone", () => {
    const policy = headersOf("/app/acme-x1").get("Permissions-Policy");
    expect(policy).toContain("camera=()");
    expect(policy).toContain("microphone=()");
  });

  it("never sends a reset link as Referer, nor lets search engines keep it", () => {
    const headers = headersOf("/reset-password");

    expect(headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(headersOf("/").has("X-Robots-Tag")).toBe(false);
  });

  it("doesn't pin HTTPS on a production build served over http (local e2e, Lighthouse)", () => {
    const headers = headersOf("/", true, false);

    expect(headers.has("Strict-Transport-Security")).toBe(false);
    expect(headers.get("Content-Security-Policy")).not.toContain("upgrade-insecure-requests");
  });

  it("leaves CSP and HSTS out of the dev server, whose scripts carry no nonce", () => {
    const headers = headersOf("/", false);

    expect(headers.has("Content-Security-Policy")).toBe(false);
    expect(headers.has("Strict-Transport-Security")).toBe(false);
    expect(headers.get("X-Frame-Options")).toBe("DENY");
  });
});
