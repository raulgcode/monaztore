import { describe, expect, it } from "vitest";
import {
  emptyBlock,
  isLandingPage,
  pageBlockTypes,
  pageFormSchema,
  pageSlugOf,
  STEPS_MAX,
  whatsappChatUrl,
} from "./pages";

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

describe("landing blocks", () => {
  const parse = (blocks: unknown[]) =>
    pageFormSchema.safeParse({ title: "Medias", slug: "medias", blocks: JSON.stringify(blocks) });

  it("takes a cover, steps, WhatsApp and a request form, with an #anchor link", () => {
    const result = parse([
      { ...emptyBlock("hero", "cover"), title: "Medias con tu foto", buttonHref: "#request" },
      {
        ...emptyBlock("steps", "how"),
        items: [{ illustration: "photo", title: "Manda tu foto", text: "" }],
      },
      { ...emptyBlock("whatsapp", "chat"), phone: "+506 8888 0000" },
      emptyBlock("form", "request"),
    ]);
    expect(result.success).toBe(true);
    if (result.success) expect(isLandingPage(result.data.blocks)).toBe(true);
  });

  it("refuses a drawing it doesn't have, a phone that isn't one and too many steps", () => {
    expect(parse([{ ...emptyBlock("hero", "cover"), illustration: "dragon" }]).success).toBe(false);
    expect(parse([{ ...emptyBlock("whatsapp", "chat"), phone: "call me" }]).success).toBe(false);
    const step = { illustration: "photo", title: "x", text: "" };
    expect(
      parse([{ ...emptyBlock("steps", "how"), items: Array(STEPS_MAX + 1).fill(step) }]).success,
    ).toBe(false);
  });

  it("refuses a link that isn't the store's, an anchor or https", () => {
    expect(
      parse([{ ...emptyBlock("hero", "cover"), buttonHref: "javascript:alert(1)" }]).success,
    ).toBe(false);
  });

  it("keeps products as a grid unless they slide", () => {
    const result = parse([{ type: "products", id: "p", title: "", collection: "", limit: 4 }]);
    expect(result.success && result.data.blocks[0]).toMatchObject({
      layout: "grid",
      onSale: false,
    });
  });

  it("is a landing only when it opens with a cover", () => {
    expect(isLandingPage([emptyBlock("heading", "a"), emptyBlock("hero", "b")])).toBe(false);
    expect(isLandingPage([])).toBe(false);
  });
});

describe("whatsappChatUrl", () => {
  it("adds Costa Rica's code to a local number and carries the message", () => {
    expect(whatsappChatUrl("8888-0000", "¡Hola!")).toBe(
      "https://wa.me/50688880000?text=%C2%A1Hola!",
    );
  });

  it("keeps a number with its own code and leaves out an empty message", () => {
    expect(whatsappChatUrl("+1 (555) 123-4567", "")).toBe("https://wa.me/15551234567");
  });

  it("gives nothing without a number", () => {
    expect(whatsappChatUrl("", "Hola")).toBeNull();
  });
});
