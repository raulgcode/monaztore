import { pageFormSchema, STEPS_MAX } from "@monaztore/contracts";
import { storeIllustrationIds } from "@monaztore/contracts/illustrations";
import {
  createPage,
  deletePage,
  getPage,
  listPages,
  setHomePage,
  updatePage,
} from "@monaztore/core";
import { z } from "zod";
import { change, destructive, json, readOnly, storeArg, ToolError, type ToolModule } from "../kit";

const pageId = z.uuid().describe("The page's id, from list_pages");

const blocksArg = z
  .array(z.record(z.string(), z.unknown()))
  .max(100)
  .describe(
    [
      "The page, block by block in order, each with a unique id (letters, digits and dashes; it is also the block's #anchor). Blocks:",
      '{ type: "hero", id, eyebrow, title, text, image (a url the store already has, or ""), illustration (one of ' +
        storeIllustrationIds.join(", ") +
        ', or ""), buttonLabel, buttonHref } a big cover; first on the page, it makes a landing;',
      '{ type: "heading", id, text, level: 2|3 }; { type: "text", id, html }; { type: "image", id, url, alt, caption };',
      '{ type: "button", id, label, href }; { type: "faq", id, items: [{ question, answer }] };',
      '{ type: "products", id, title, collection (a category slug or ""), onSale, layout: "grid"|"carousel", limit: 2-12 };',
      '{ type: "collections", id, title, limit: 2-12 } the categories with their photos;',
      '{ type: "highlights", id, items: [up to 4 short promises] };',
      `{ type: "steps", id, title, intro, items: [{ illustration, title, text }] (up to ${STEPS_MAX}) } how it works;`,
      '{ type: "whatsapp", id, title, text, label, phone (+506 8888 8888), message } a big WhatsApp button;',
      '{ type: "form", id, title, text, messageLabel, buttonLabel } a request form (spam-protected); requests arrive by email and in list_requests;',
      '{ type: "cta", id, title, text, illustration, buttonLabel, buttonHref } a card with one big button ("Didn\'t find what you were looking for?" → the custom order page).',
      "Links (href) are /paths of the store, #anchors of a block or https://….",
    ].join(" "),
  );

const pageFields = {
  title: z.string().min(1).max(120).optional(),
  slug: z
    .string()
    .max(80)
    .optional()
    .describe("Its address on the store: /<slug>. Changing a published one leaves a 301."),
  seoTitle: z.string().max(70).optional(),
  seoDescription: z.string().max(160).optional(),
  blocks: blocksArg.optional(),
  published: z.boolean().optional().describe("true: in the store and its footer; false: a draft"),
};

/** The store's own pages ("About us", "Questions"), built from blocks. Owners only. */
export const registerPageTools: ToolModule = (server, kit) => {
  const owners = (store: string) => kit.tenantFor(store, { owner: true });
  const link = (store: string, id: string) => kit.workspace(store, `/pages/${id}`);

  server.registerTool(
    "list_pages",
    {
      title: "List pages",
      description:
        "The store's pages with their address, whether they are published and which one is the front page (isHome).",
      inputSchema: { store: storeArg },
      annotations: readOnly,
    },
    kit.tool(async ({ store }: { store: string }) => {
      const tenant = await kit.tenantFor(store);
      return json({ pages: await listPages(tenant) });
    }),
  );

  server.registerTool(
    "get_page",
    {
      title: "See a page",
      description: "A page with its blocks, as the editor shows them.",
      inputSchema: { store: storeArg, pageId },
      annotations: readOnly,
    },
    kit.tool(async ({ store, pageId: id }: { store: string; pageId: string }) => {
      const tenant = await kit.tenantFor(store);
      const page = await getPage(tenant, id);
      if (!page) throw new ToolError(`No page ${id} in this store. Call list_pages.`);
      return json({ page, workspace: link(store, id) });
    }),
  );

  server.registerTool(
    "save_page",
    {
      title: "Create or change a page",
      description:
        "Without pageId it creates one (a draft unless published is true); with it, changes only what is given (blocks replace all the blocks). Owners only. Show the person the page and ask before saving or publishing.",
      inputSchema: { store: storeArg, pageId: pageId.optional(), ...pageFields },
      annotations: change,
    },
    kit.tool(
      async ({
        store,
        pageId: id,
        published,
        ...changes
      }: {
        store: string;
        pageId?: string;
        title?: string;
        slug?: string;
        seoTitle?: string;
        seoDescription?: string;
        blocks?: Record<string, unknown>[];
        published?: boolean;
      }) => {
        const tenant = await owners(store);
        const current = id ? await getPage(tenant, id) : null;
        if (id && !current) throw new ToolError(`No page ${id} in this store.`);
        if (!current && (!changes.title || !changes.slug)) {
          throw new ToolError("A new page needs a title and a slug.");
        }
        const form = pageFormSchema.parse({
          title: changes.title ?? current?.title,
          slug: changes.slug ?? current?.slug,
          seoTitle: changes.seoTitle ?? current?.seoTitle ?? "",
          seoDescription: changes.seoDescription ?? current?.seoDescription ?? "",
          blocks: JSON.stringify(changes.blocks ?? current?.blocks ?? []),
        });
        const status =
          published === undefined
            ? (current?.status ?? "draft")
            : published
              ? "published"
              : "draft";
        let saved: string;
        if (current) {
          await updatePage(tenant, current.id, { ...form, status });
          saved = current.id;
        } else {
          saved = (await createPage(tenant, { ...form, status })).id;
        }
        return json({
          saved: true,
          page: await getPage(tenant, saved),
          workspace: link(store, saved),
        });
      },
    ),
  );

  server.registerTool(
    "set_front_page",
    {
      title: "Choose the front page",
      description:
        "Makes a page the store's front page (what opens at /), built with its blocks; without pageId, the store goes back to the front page of its design. A draft front page doesn't show until it's published. Owners only. Ask before changing it.",
      inputSchema: { store: storeArg, pageId: pageId.optional() },
      annotations: change,
    },
    kit.tool(async ({ store, pageId: id }: { store: string; pageId?: string }) => {
      const tenant = await owners(store);
      if (id && !(await getPage(tenant, id))) throw new ToolError(`No page ${id} in this store.`);
      await setHomePage(tenant, id ?? null);
      return json({ saved: true, pages: await listPages(tenant) });
    }),
  );

  server.registerTool(
    "delete_page",
    {
      title: "Delete a page",
      description: "Removes the page from the store. Ask before deleting: it can't be undone.",
      inputSchema: { store: storeArg, pageId },
      annotations: destructive,
    },
    kit.tool(async ({ store, pageId: id }: { store: string; pageId: string }) => {
      const tenant = await owners(store);
      await deletePage(tenant, id);
      return json({ deleted: true });
    }),
  );
};
