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

describe("store menus", () => {
  const parse = (fields: Record<string, string>) =>
    storeThemeSchema.safeParse({ theme: "essential", ...fields });

  it("reads the top menu with its submenus and drops rows left empty", () => {
    const result = parse({
      menu: JSON.stringify([
        {
          label: "Medias",
          href: "/collections/medias",
          children: [
            { label: "Con foto", href: "/personalizado" },
            { label: "", href: "" },
          ],
        },
        { label: "", href: "" },
        { label: "Preguntas", href: "/preguntas" },
      ]),
    });
    expect(result.success && result.data.menu).toEqual([
      {
        label: "Medias",
        href: "/collections/medias",
        children: [{ label: "Con foto", href: "/personalizado" }],
      },
      { label: "Preguntas", href: "/preguntas", children: [] },
    ]);
  });

  it("reads the footer's links", () => {
    const result = parse({ footerMenu: JSON.stringify([{ label: "FAQ", href: "/faq" }]) });
    expect(result.success && result.data.footerMenu).toEqual([{ label: "FAQ", href: "/faq" }]);
  });

  it("refuses a link without text, a bad address or JSON that isn't a list", () => {
    expect(parse({ menu: JSON.stringify([{ label: "", href: "/x" }]) }).success).toBe(false);
    expect(parse({ menu: JSON.stringify([{ label: "X", href: "javascript:1" }]) }).success).toBe(
      false,
    );
    expect(parse({ footerMenu: "{nope" }).success).toBe(false);
  });

  it("keeps the cover, the promises and the categories menu unless told to hide them", () => {
    const result = parse({});
    expect(result.success && result.data).toMatchObject({
      hideHero: false,
      hideHighlights: false,
      hideCategoriesMenu: false,
      categoryChips: false,
      menu: [],
      footerMenu: [],
    });
  });
});
