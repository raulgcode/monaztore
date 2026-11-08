import { describe, expect, it } from "vitest";
import { emptyBlock, pageBlockTypes, pageFormSchema, pageSlugOf } from "./pages";

const form = (overrides: Record<string, string> = {}) => ({
  title: "Preguntas frecuentes",
  slug: "faqs",
  blocks: JSON.stringify([{ type: "heading", id: "b1", text: "Envíos", level: 2 }]),
  ...overrides,
});

describe("pageFormSchema", () => {
  it("takes a page with its blocks", () => {
    const result = pageFormSchema.parse(form());
    expect(result.blocks).toEqual([{ type: "heading", id: "b1", text: "Envíos", level: 2 }]);
    expect(result.seoTitle).toBe("");
  });

  it("refuses an address the store already uses, or one with odd characters", () => {
    for (const [slug, key] of [
      ["products", "forms.pageSlugReserved"],
      ["sobre nosotros", "forms.pageSlugInvalid"],
      ["-a", "forms.pageSlugInvalid"],
    ] as const) {
      const result = pageFormSchema.safeParse(form({ slug }));
      expect(result.error?.issues.map((issue) => issue.message)).toEqual([key]);
    }
  });

  it("refuses blocks it doesn't know and links that run code", () => {
    for (const blocks of [
      "not json",
      JSON.stringify([{ type: "video", id: "v" }]),
      JSON.stringify([{ type: "button", id: "b", label: "Ir", href: "javascript:alert(1)" }]),
      JSON.stringify([
        { type: "image", id: "i", url: "//evil.example/a.png", alt: "", caption: "" },
      ]),
    ]) {
      const result = pageFormSchema.safeParse(form({ blocks }));
      expect(result.error?.issues.map((issue) => [issue.path[0], issue.message])).toEqual([
        ["blocks", "forms.blocksInvalid"],
      ]);
    }
  });

  it("starts every kind of block valid", () => {
    const blocks = pageBlockTypes.map((type, index) => emptyBlock(type, `b${index}`));
    expect(pageFormSchema.safeParse(form({ blocks: JSON.stringify(blocks) })).success).toBe(true);
  });
});

describe("pageSlugOf", () => {
  it("makes an address out of a title", () => {
    expect(pageSlugOf("  Preguntas Frecuentes (FAQ)! ")).toBe("preguntas-frecuentes-faq");
    expect(pageSlugOf("Contáctanos")).toBe("contactanos");
  });
});
