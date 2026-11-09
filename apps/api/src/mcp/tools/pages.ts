import { pageFormSchema } from "@monaztore/contracts";
import { createPage, deletePage, getPage, listPages, updatePage } from "@monaztore/core";
import { z } from "zod";
import { change, destructive, json, readOnly, storeArg, ToolError, type ToolModule } from "../kit";

const pageId = z.uuid().describe("The page's id, from list_pages");

const blocksArg = z
  .array(z.record(z.string(), z.unknown()))
  .max(100)
  .describe(
    'The page, block by block, each with a unique id: { type: "heading", id, text, level: 2|3 }, { type: "text", id, html }, { type: "image", id, url, alt, caption } (a url the store already has), { type: "button", id, label, href }, { type: "faq", id, items: [{ question, answer }] } or { type: "products", id, title, collection, limit: 2-12 }.',
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
      description: "The store's pages with their address and whether they are published.",
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
