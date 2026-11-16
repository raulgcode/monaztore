import { z } from "zod/mini";
import { storeIllustrationIds } from "./illustrations";
import { message } from "./message";

// A page the store builds in the workspace's block editor and the storefront shows at /<slug>.
// The same blocks are drawn by the editor's preview and by the storefront.

const id = z.string().check(z.minLength(1), z.maxLength(40));
const text = (max: number) => z.string().check(z.maxLength(max));

/**
 * Where a link or photo may point: one of our own paths (`/products/…`, `/media/…`), a web
 * address or a block of the same page (`#request`). Never `javascript:` or `data:`.
 */
export const linkTarget = z.string().check(
  z.maxLength(500),
  z.refine(
    (value) =>
      (value.startsWith("/") && !value.startsWith("//")) ||
      /^https?:\/\//i.test(value) ||
      /^#[a-z0-9-]+$/i.test(value),
    message("forms.linkInvalid"),
  ),
);

export const headingBlock = z.object({
  type: z.literal("heading"),
  id,
  text: text(200),
  level: z._default(z.union([z.literal(2), z.literal(3)]), 2),
});

/** Formatted text: HTML from the editor or an import, cleaned by core on every save. */
export const textBlock = z.object({
  type: z.literal("text"),
  id,
  html: text(20_000),
});

export const imageBlock = z.object({
  type: z.literal("image"),
  id,
  url: z.union([z.literal(""), linkTarget]),
  alt: text(200),
  caption: text(200),
});

export const buttonBlock = z.object({
  type: z.literal("button"),
  id,
  label: text(60),
  href: z.union([z.literal(""), linkTarget]),
});

/** Questions and answers that open one at a time; search engines read them as a FAQ. */
export const faqBlock = z.object({
  type: z.literal("faq"),
  id,
  items: z.array(z.object({ question: text(300), answer: text(3000) })).check(z.maxLength(60)),
});

/** A row of the store's products: the newest, those on sale, or those of one collection. */
export const productsBlock = z.object({
  type: z.literal("products"),
  id,
  title: text(120),
  collection: text(200),
  /** Only what's on sale now (of the collection, when there is one). */
  onSale: z._default(z.boolean(), false),
  /** A grid, or one row that slides sideways. */
  layout: z._default(z.enum(["grid", "carousel"]), "grid"),
  limit: z._default(z.int().check(z.minimum(2), z.maximum(12)), 4),
});

/** The store's categories as tiles with their photos, to start browsing. */
export const collectionsBlock = z.object({
  type: z.literal("collections"),
  id,
  title: text(120),
  limit: z._default(z.int().check(z.minimum(2), z.maximum(12)), 8),
});

export const HIGHLIGHTS_BLOCK_MAX = 4;

/** A strip of short promises: "Delivery in 24 h", "Pay with SINPE Móvil". */
export const highlightsBlock = z.object({
  type: z.literal("highlights"),
  id,
  items: z.array(text(60)).check(z.maxLength(HIGHLIGHTS_BLOCK_MAX)),
});

const illustration = z.enum(storeIllustrationIds);

/**
 * The top of a landing page: a short line above, the title (the page's h1), a few words, a
 * photo or one of the built-in drawings, and its main button. A page that starts with one is
 * drawn full width, as a landing.
 */
export const heroBlock = z.object({
  type: z.literal("hero"),
  id,
  eyebrow: text(60),
  title: text(120),
  text: text(400),
  image: z.union([z.literal(""), linkTarget]),
  illustration: z._default(z.union([z.literal(""), illustration]), ""),
  buttonLabel: text(60),
  buttonHref: z.union([z.literal(""), linkTarget]),
});

export const STEPS_MAX = 8;

/** How something works, step by step, each with its drawing: "Send your photo", "We make it"… */
export const stepsBlock = z.object({
  type: z.literal("steps"),
  id,
  title: text(120),
  intro: text(400),
  items: z
    .array(z.object({ illustration, title: text(80), text: text(400) }))
    .check(z.maxLength(STEPS_MAX)),
});

/** A phone WhatsApp opens: digits, spaces, dashes and an optional + at the start. */
export const whatsappPhone = z.string().check(
  z.trim(),
  z.maxLength(20),
  z.refine(
    (value) => value === "" || /^\+?[\d\s()-]{8,20}$/.test(value),
    message("forms.phoneInvalid"),
  ),
);

/** A big WhatsApp button that opens a chat with the store, with the first message written. */
export const whatsappBlock = z.object({
  type: z.literal("whatsapp"),
  id,
  title: text(120),
  text: text(300),
  label: text(60),
  phone: whatsappPhone,
  message: text(300),
});

/**
 * A request form: name, email, phone and what they want. It reaches the store's Requests
 * (`store_inquiry`) and the owners' email; `messageLabel` names the big field ("Your idea").
 */
export const formBlock = z.object({
  type: z.literal("form"),
  id,
  title: text(120),
  text: text(400),
  messageLabel: text(80),
  buttonLabel: text(60),
});

/**
 * A call to action: a card with a drawing, a title, a few words and one big button, such as
 * "Didn't find what you were looking for?" → the personalized order page.
 */
export const ctaBlock = z.object({
  type: z.literal("cta"),
  id,
  title: text(120),
  text: text(400),
  illustration: z._default(z.union([z.literal(""), illustration]), ""),
  buttonLabel: text(60),
  buttonHref: z.union([z.literal(""), linkTarget]),
});

export const pageBlockSchema = z.discriminatedUnion("type", [
  headingBlock,
  textBlock,
  imageBlock,
  buttonBlock,
  faqBlock,
  productsBlock,
  collectionsBlock,
  highlightsBlock,
  heroBlock,
  stepsBlock,
  whatsappBlock,
  formBlock,
  ctaBlock,
]);

export const pageBlocksSchema = z.array(pageBlockSchema).check(z.maxLength(100));

export type PageBlock = z.infer<typeof pageBlockSchema>;
export type PageBlockType = PageBlock["type"];
export const pageBlockTypes: PageBlockType[] = [
  "heading",
  "text",
  "image",
  "button",
  "faq",
  "products",
  "collections",
  "highlights",
  "hero",
  "steps",
  "whatsapp",
  "form",
  "cta",
];

/** A new, empty block of a type, with an id of its own. */
export function emptyBlock(type: PageBlockType, blockId: string): PageBlock {
  switch (type) {
    case "heading":
      return { type, id: blockId, text: "", level: 2 };
    case "text":
      return { type, id: blockId, html: "" };
    case "image":
      return { type, id: blockId, url: "", alt: "", caption: "" };
    case "button":
      return { type, id: blockId, label: "", href: "" };
    case "faq":
      return { type, id: blockId, items: [{ question: "", answer: "" }] };
    case "products":
      return {
        type,
        id: blockId,
        title: "",
        collection: "",
        onSale: false,
        layout: "grid",
        limit: 4,
      };
    case "collections":
      return { type, id: blockId, title: "", limit: 8 };
    case "highlights":
      return { type, id: blockId, items: ["", "", ""] };
    case "hero":
      return {
        type,
        id: blockId,
        eyebrow: "",
        title: "",
        text: "",
        image: "",
        illustration: "",
        buttonLabel: "",
        buttonHref: "",
      };
    case "steps":
      return {
        type,
        id: blockId,
        title: "",
        intro: "",
        items: [{ illustration: "photo", title: "", text: "" }],
      };
    case "whatsapp":
      return { type, id: blockId, title: "", text: "", label: "", phone: "", message: "" };
    case "form":
      return { type, id: blockId, title: "", text: "", messageLabel: "", buttonLabel: "" };
    case "cta":
      return {
        type,
        id: blockId,
        title: "",
        text: "",
        illustration: "heart",
        buttonLabel: "",
        buttonHref: "",
      };
  }
}

/** A page that starts with a hero is a landing: drawn full width, its hero holds the h1. */
export const isLandingPage = (blocks: PageBlock[]) => blocks[0]?.type === "hero";

/** The WhatsApp chat a block opens, with its message written; null without a usable number. */
export function whatsappChatUrl(phone: string, text: string, countryCode = "506"): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  const number = digits.length === 8 ? countryCode + digits : digits;
  return `https://wa.me/${number}${text.trim() ? `?text=${encodeURIComponent(text.trim())}` : ""}`;
}

/**
 * Addresses the storefront already uses: a page can't take them, or it would never be reached
 * (`/products`) or would hide a tool (`/media`).
 */
export const reservedPageSlugs = [
  "products",
  "collections",
  "cart",
  "checkout",
  "orders",
  "downloads",
  "search",
  "sitemap.xml",
  "robots.txt",
  "media",
  "login",
  "logout",
  "sign-up",
  "forgot-password",
  "reset-password",
  "theme",
  "locale",
  "api",
  "admin",
  "app",
  "dev",
  "inquiries",
];

export const pageSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `"  Preguntas Frecuentes! "` → `"preguntas-frecuentes"`, for the address field. */
export function pageSlugOf(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

/** The blocks travel as JSON in one hidden field; anything off is one error on that field. */
const blocksJson = z.pipe(
  z._default(z.string(), "[]"),
  z.transform((value, ctx): PageBlock[] => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = undefined;
    }
    const result = pageBlocksSchema.safeParse(parsed);
    if (!result.success) {
      ctx.issues.push({ code: "custom", input: value, message: message("forms.blocksInvalid") });
      return [];
    }
    return result.data;
  }),
);

/** The page editor's form: its fields, and its blocks as JSON. */
export const pageFormSchema = z.object({
  title: z
    .string(message("forms.pageTitleRequired"))
    .check(
      z.trim(),
      z.minLength(1, message("forms.pageTitleRequired")),
      z.maxLength(120, message("forms.textTooLong")),
    ),
  slug: z.string(message("forms.pageSlugInvalid")).check(
    z.trim(),
    z.toLowerCase(),
    z.regex(pageSlugPattern, message("forms.pageSlugInvalid")),
    z.maxLength(80, message("forms.textTooLong")),
    z.refine((slug) => !reservedPageSlugs.includes(slug), message("forms.pageSlugReserved")),
  ),
  seoTitle: z._default(
    z.string().check(z.trim(), z.maxLength(70, message("forms.textTooLong"))),
    "",
  ),
  seoDescription: z._default(
    z.string().check(z.trim(), z.maxLength(160, message("forms.textTooLong"))),
    "",
  ),
  blocks: blocksJson,
});

export type PageForm = z.infer<typeof pageFormSchema>;
