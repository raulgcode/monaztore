import { describe, expect, it } from "vitest";
import { nextTheme, parseTheme } from "./theme";

describe("theme", () => {
  it("cycles system → light → dark → system", () => {
    expect(nextTheme("system")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("system");
  });

  it("falls back to system for anything unexpected", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("purple")).toBe("system");
    expect(parseTheme(undefined)).toBe("system");
  });
});
