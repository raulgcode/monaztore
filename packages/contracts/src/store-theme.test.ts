import { describe, expect, it } from "vitest";
import { storeThemeSchema } from "./store-theme";

describe("storeThemeSchema", () => {
  it("takes a theme with no brand of its own", () => {
    expect(storeThemeSchema.parse({ theme: "boutique" })).toMatchObject({
      theme: "boutique",
      brandColor: "",
      removeLogo: false,
    });
  });
  it("keeps the brand color as #rrggbb", () => {
    expect(storeThemeSchema.parse({ theme: "essential", brandColor: "#BE185D" }).brandColor).toBe(
      "#be185d",
    );
  });
  it("says what's wrong with an unknown theme or color", () => {
    const result = storeThemeSchema.safeParse({ theme: "neon", brandColor: "pink" });
    expect(result.error?.issues.map((issue) => [issue.path[0], issue.message])).toEqual([
      ["theme", "forms.themeRequired"],
      ["brandColor", "forms.colorInvalid"],
    ]);
  });
});
