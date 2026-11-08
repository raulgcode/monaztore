import { z } from "zod/mini";
import { message } from "./message";

// A page the store builds in the workspace's block editor and the storefront shows at /<slug>.
// The same blocks are drawn by the editor's preview and by the storefront.

const id = z.string().check(z.minLength(1), z.maxLength(40));
const text = (max: number) => z.string().check(z.maxLength(max));

/**
 * Where a link or photo may point: one of our own paths (`/products/…`, `/media/…`) or a web
 * address. Never `javascript:` or `data:`.
 */
export const linkTarget = z.string().check(
  z.maxLength(500),
  z.refine(
    (value) => (value.startsWith("/") && !value.startsWith("//")) || /^https?:\/\//i.test(value),
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

/** A row of the store's products: the newest, or those of one collection. */
export const productsBlock = z.object({
  type: z.literal("products"),
  id,
  title: text(120),
  collection: text(200),
  limit: z._default(z.int().check(z.minimum(2), z.maximum(12)), 4),
});

export const pageBlockSchema = z.discriminatedUnion("type", [
  headingBlock,
  textBlock,
  imageBlock,
  buttonBlock,
  faqBlock,
  productsBlock,
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
      return { type, id: blockId, title: "", collection: "", limit: 4 };
  }
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
  "app",
  "dev",
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
