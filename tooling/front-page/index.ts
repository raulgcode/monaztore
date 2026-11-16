/**
 * Gives a store a front page built from blocks, or retouches the one it has: the cover's texts
 * and a "Didn't find what you were looking for?" card at the end, which leads to another page.
 * The same can be done by hand in Pages; this is for setting up a store from a terminal.
 *
 *   pnpm store:front-page --store <store-slug> \
 *     --eyebrow "Hechas en Costa Rica" --title "…" --text "…" --button "Ver todas las medias" \
 *     --cta-href /medias-personalizadas
 *
 * Options left out keep what the page has (or the defaults below for a new page). It publishes
 * the page and makes it the front page. Run it again as often as you like: the card is added once.
 */
import { parseArgs } from "node:util";
import type { PageBlock } from "@monaztore/contracts";
import {
  createPage,
  getPage,
  listPages,
  ownerContextForStore,
  setHomePage,
  updatePage,
} from "@monaztore/core";
import { createDatabase } from "@monaztore/db";
import { loadDotEnv } from "@monaztore/env";

const { values } = parseArgs({
  options: {
    store: { type: "string" },
    eyebrow: { type: "string" },
    title: { type: "string" },
    text: { type: "string" },
    button: { type: "string" },
    "button-href": { type: "string" },
    "cta-title": { type: "string", default: "¿No encontraste lo que buscabas?" },
    "cta-text": {
      type: "string",
      default: "Cuéntanos tu idea y la hacemos solo para ti, con tu foto, tu nombre o tu diseño.",
    },
    "cta-button": { type: "string", default: "Pedir uno personalizado" },
    "cta-href": { type: "string", default: "/personalizado" },
  },
});

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!values.store) fail("Usage: pnpm store:front-page --store <store-slug> [--title …]");
loadDotEnv();
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) fail("DATABASE_URL is not set: run pnpm run setup first");

const { db, close } = createDatabase(databaseUrl);
try {
  const ctx = await ownerContextForStore(db, values.store);
  if (!ctx) fail(`There is no store "${values.store}" with an owner`);

  const home = (await listPages(ctx)).find((page) => page.isHome);
  const current = home ? await getPage(ctx, home.id) : null;
  const blocks: PageBlock[] = current?.blocks ?? [
    {
      type: "hero",
      id: "cover",
      eyebrow: "",
      title: "",
      text: "",
      image: "",
      illustration: "gift",
      buttonLabel: "Ver el catálogo",
      buttonHref: "/products",
    },
    { type: "collections", id: "categories", title: "Compra por categoría", limit: 8 },
    {
      type: "products",
      id: "new",
      title: "Lo nuevo",
      collection: "",
      onSale: false,
      layout: "carousel",
      limit: 8,
    },
  ];

  const next = blocks.map((block): PageBlock => {
    if (block.type !== "hero") return block;
    return {
      ...block,
      eyebrow: values.eyebrow ?? block.eyebrow,
      title: values.title ?? block.title,
      text: values.text ?? block.text,
      buttonLabel: values.button ?? block.buttonLabel,
      buttonHref: values["button-href"] ?? block.buttonHref,
    };
  });
  if (!next.some((block) => block.type === "cta")) {
    next.push({
      type: "cta",
      id: "not-found",
      title: values["cta-title"],
      text: values["cta-text"],
      illustration: "heart",
      buttonLabel: values["cta-button"],
      buttonHref: values["cta-href"],
    });
  }

  const input = {
    title: current?.title ?? "Página de inicio",
    slug: current?.slug ?? "inicio",
    seoTitle: current?.seoTitle ?? "",
    seoDescription: current?.seoDescription ?? "",
    status: "published" as const,
    blocks: next,
  };
  if (current) {
    await updatePage(ctx, current.id, input);
    console.log(`✓ Updated and published “${input.title}”, the store's front page`);
  } else {
    const { id } = await createPage(ctx, input);
    await setHomePage(ctx, id);
    console.log(`✓ Created “${input.title}” and made it the store's front page`);
  }
} finally {
  await close();
}
