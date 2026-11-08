import { describe, expect, it } from "vitest";
import { safeRedirect } from "./safe-redirect";

describe("safeRedirect", () => {
  it("keeps a path on this site, with its query and hash", () => {
    expect(safeRedirect("/app/acme-x1/settings?q=ana#top")).toBe("/app/acme-x1/settings?q=ana#top");
  });

  it.each([
    "//evil.com",
    "/\\evil.com",
    "/\\/evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "https://evil.com",
    "javascript:alert(1)",
    "evil.com",
    "",
  ])("sends %j to the fallback", (value) => {
    expect(safeRedirect(value, "/app")).toBe("/app");
  });

  it("falls back for what isn't text", () => {
    expect(safeRedirect(null)).toBe("/");
    expect(safeRedirect(new File([], "x"))).toBe("/");
  });
});
