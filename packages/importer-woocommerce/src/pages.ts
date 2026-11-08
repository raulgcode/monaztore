import { type ImportedPage, type PageBlock, pageSlugOf } from "@monaztore/contracts";
import { type HTMLElement, type Node, NodeType, parse } from "node-html-parser";
import type { WooCommerceClient } from "./client";
import { decodeEntities, imageSrc, pathOf } from "./map";

/** A WordPress page as `wp/v2/pages` answers it, trimmed to what the importer reads. */
export interface WordPressPage {
  id: number;
  slug: string;
  link: string;
  status: string;
  title: { rendered: string };
  content: { rendered: string };
}

/**
 * Pages WooCommerce and its plugins create for themselves (the cart, the checkout, the account,
 * the shop, a wishlist): the new store has its own, so they aren't brought.
 */
const functionalSlugs = new Set([
  "cart",
  "carrito",
  "checkout",
  "finalizar-compra",
  "my-account",
  "mi-cuenta",
  "shop",
  "tienda",
  "wishlist",
  "lista-de-deseos",
  "blog",
]);

const skipped = new Set(["script", "style", "form", "noscript", "iframe", "svg", "button"]);
const textTags = new Set(["p", "ul", "ol", "blockquote", "table"]);

const isElement = (node: Node): node is HTMLElement => node.nodeType === NodeType.ELEMENT_NODE;
const clean = (text: string) => decodeEntities(text).replace(/\s+/g, " ").trim();

/** An answer as plain text: one line per paragraph, numbered or bulleted lists kept. */
function answerText(element: HTMLElement): string {
  const lines: string[] = [];
  const walk = (node: Node) => {
    if (!isElement(node)) {
      const text = clean(node.rawText);
      if (text) lines.push(text);
      return;
    }
    const tag = node.tagName.toLowerCase();
    if (tag === "ol" || tag === "ul") {
      node.childNodes.filter(isElement).forEach((item, index) => {
        lines.push(`${tag === "ol" ? `${index + 1}.` : "•"} ${clean(item.textContent)}`);
      });
      return;
    }
    if (tag === "p" || tag === "li" || /^h[1-6]$/.test(tag)) {
      const text = clean(node.textContent);
      if (text) lines.push(text);
      return;
    }
    node.childNodes.forEach(walk);
  };
  walk(element);
  return lines.join("\n").slice(0, 3000);
}

/**
 * A page's HTML as blocks: headings, text, photos, and questions from the accordions themes
 * like Flatsome draw. What a block can't hold (forms, scripts, layout) is left out and noted.
 */
export function wordPressPageBlocks(
  html: string,
  title: string,
): { blocks: PageBlock[]; dropped: string[] } {
  const blocks: PageBlock[] = [];
  const dropped = new Set<string>();
  let pendingText: string[] = [];
  const id = () => `b${blocks.length + 1}`;
  const flush = () => {
    const joined = pendingText.join("\n").trim();
    pendingText = [];
    if (joined) blocks.push({ type: "text", id: id(), html: joined.slice(0, 20_000) });
  };

  const walk = (node: Node) => {
    if (!isElement(node)) {
      const text = clean(node.rawText);
      if (text) pendingText.push(`<p>${text}</p>`);
      return;
    }
    const tag = node.tagName.toLowerCase();
    const classes = node.classList;
    if (skipped.has(tag) || classes.contains("screen-reader-response")) {
      if (tag === "form") dropped.add("form");
      return;
    }
    if (classes.contains("wpcf7")) {
      dropped.add("form");
      return;
    }
    if (classes.contains("accordion")) {
      flush();
      const items = node.querySelectorAll(".accordion-item").flatMap((item) => {
        const question = clean(item.querySelector(".accordion-title")?.textContent ?? "");
        const inner = item.querySelector(".accordion-inner");
        return question
          ? [{ question: question.slice(0, 300), answer: inner ? answerText(inner) : "" }]
          : [];
      });
      if (items.length > 0) blocks.push({ type: "faq", id: id(), items: items.slice(0, 60) });
      return;
    }
    if (/^h[1-6]$/.test(tag)) {
      const text = clean(node.textContent);
      // A theme often repeats the page's title inside it.
      if (text && text.toLowerCase() !== title.toLowerCase()) {
        flush();
        blocks.push({
          type: "heading",
          id: id(),
          text: text.slice(0, 200),
          level: tag <= "h2" ? 2 : 3,
        });
      }
      return;
    }
    if (tag === "img") {
      const url = imageSrc(node.getAttribute("src"));
      if (url) {
        flush();
        blocks.push({
          type: "image",
          id: id(),
          url,
          alt: clean(node.getAttribute("alt") ?? "").slice(0, 200),
          caption: "",
        });
      }
      return;
    }
    if (textTags.has(tag)) {
      if (clean(node.textContent)) pendingText.push(node.outerHTML);
      return;
    }
    node.childNodes.forEach(walk);
  };

  parse(html).childNodes.forEach(walk);
  flush();
  return { blocks: blocks.slice(0, 100), dropped: [...dropped] };
}

/**
 * The shop's own pages ("FAQs", "About us"), from WordPress's public API: what visitors see,
 * without the ones WooCommerce makes (cart, checkout…) nor the front page.
 */
export async function fetchWordPressPages(
  client: WooCommerceClient,
): Promise<{ pages: ImportedPage[]; warnings: string[] }> {
  const raw = await client.all<WordPressPage>(
    "wp/v2/pages",
    { _fields: "id,slug,link,status,title,content" },
    { anonymous: true },
  );
  const pages: ImportedPage[] = [];
  const warnings: string[] = [];
  for (const page of raw) {
    const path = pathOf(page.link);
    if (!path || functionalSlugs.has(page.slug) || page.status !== "publish") continue;
    const title = clean(page.title.rendered);
    const { blocks, dropped } = wordPressPageBlocks(page.content.rendered, title);
    if (dropped.includes("form")) {
      warnings.push(
        `"${title}" had a form, which pages don't have: write how to reach you instead.`,
      );
    }
    let slug: string;
    try {
      slug = pageSlugOf(decodeURIComponent(page.slug));
    } catch {
      slug = pageSlugOf(page.slug);
    }
    pages.push({
      externalId: String(page.id),
      slug: slug || `page-${page.id}`,
      title,
      blocks,
      // An empty page waits as a draft until the store writes it.
      status: blocks.length > 0 ? "published" : "draft",
      oldPath: path,
    });
  }
  return { pages, warnings };
}
