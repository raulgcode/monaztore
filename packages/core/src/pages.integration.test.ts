import type { PageBlock } from "@monaztore/contracts";
import { createTestDatabase, createTestTenant } from "@monaztore/db/testing";
import { afterAll, describe, expect, it } from "vitest";
import {
  createPage,
  deletePage,
  getPage,
  getStorePage,
  importPages,
  listPages,
  listStorePages,
  type PageInput,
  updatePage,
} from "./pages";
import { findRedirect, type StorefrontContext, sitemapEntries } from "./storefront";
import { resolveTenant } from "./workspaces";

const connection = createTestDatabase();
afterAll(() => connection.close());
const db = connection.db;

async function owner() {
  const tenant = await createTestTenant(db);
  const ctx = await resolveTenant(db, tenant.userId, tenant.slug);
  if (!ctx) throw new Error("no tenant");
  const store: StorefrontContext = {
    db,
    store: {
      organizationId: ctx.organizationId,
      name: "Tienda",
      slug: tenant.slug,
      hostname: "t.cr",
    },
  };
  return { ctx, store };
}

const blocks: PageBlock[] = [
  { type: "heading", id: "h", text: "Envíos", level: 2 },
  {
    type: "text",
    id: "t",
    html: '<p>Hola <script>alert(1)</script><a href="javascript:x">x</a> <a href="/products/taza">taza</a></p>',
  },
  { type: "faq", id: "f", items: [{ question: "¿Dónde están?", answer: "En Heredia" }] },
];

const input = (overrides: Partial<PageInput> = {}): PageInput => ({
  title: "Preguntas frecuentes",
  slug: "faqs",
  seoTitle: "",
  seoDescription: "",
  blocks,
  status: "published",
  ...overrides,
});

describe("pages", () => {
  it("saves a page with its blocks cleaned and shows it on the storefront once published", async () => {
    const { ctx, store } = await owner();
    const { id } = await createPage(ctx, input({ status: "draft" }));

    const saved = await getPage(ctx, id);
    expect(saved?.blocks[1]).toEqual({
      type: "text",
      id: "t",
      html: '<p>Hola <a rel="nofollow noopener" target="_blank">x</a> <a href="/products/taza">taza</a></p>',
    });
    expect(await getStorePage(store, "faqs")).toBeNull();

    await updatePage(ctx, id, input());
    const shown = await getStorePage(store, "faqs");
    expect(shown?.title).toBe("Preguntas frecuentes");
    expect(shown?.blocks.map((block) => block.type)).toEqual(["heading", "text", "faq"]);
    expect((await listStorePages(store)).map((page) => page.slug)).toEqual(["faqs"]);
    expect((await sitemapEntries(store)).map((entry) => entry.path)).toEqual(["/faqs"]);
  });

  it("moves the old address of a published page to its new one", async () => {
    const { ctx, store } = await owner();
    const { id } = await createPage(ctx, input());
    await updatePage(ctx, id, input({ slug: "preguntas" }));
    expect(await findRedirect(store, "/faqs")).toBe("/preguntas");
    expect(await getStorePage(store, "preguntas")).not.toBeNull();
  });

  it("refuses an address that is taken or that the store already uses", async () => {
    const { ctx } = await owner();
    await createPage(ctx, input());
    await expect(createPage(ctx, input())).rejects.toMatchObject({ code: "slug_taken" });
    await expect(createPage(ctx, input({ slug: "products" }))).rejects.toMatchObject({
      code: "invalid_slug",
    });
  });

  it("only lets owners change pages", async () => {
    const { ctx } = await owner();
    await expect(createPage({ ...ctx, role: "member" }, input())).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("never shows or changes another workspace's pages", async () => {
    const a = await owner();
    const b = await owner();
    const { id } = await createPage(a.ctx, input());
    expect(await getPage(b.ctx, id)).toBeNull();
    expect(await listPages(b.ctx)).toEqual([]);
    expect(await getStorePage(b.store, "faqs")).toBeNull();
    await expect(updatePage(b.ctx, id, input({ title: "Mío" }))).rejects.toThrow(/not found/);
    await expect(deletePage(b.ctx, id)).rejects.toThrow(/not found/);
    expect((await getPage(a.ctx, id))?.title).toBe("Preguntas frecuentes");
  });

  it("imports pages again without duplicating them and redirects their old address", async () => {
    const { ctx, store } = await owner();
    const page = {
      externalId: "41",
      slug: "contactanos",
      title: "Contáctanos",
      blocks: [{ type: "text" as const, id: "t", html: "<p>Escríbenos</p>" }],
      status: "published" as const,
      oldPath: "/contactanos/",
    };
    await importPages(ctx, "woocommerce", [page]);
    await importPages(ctx, "woocommerce", [{ ...page, title: "Contacto" }]);
    expect((await listPages(ctx)).map((p) => [p.slug, p.title])).toEqual([
      ["contactanos", "Contacto"],
    ]);

    await importPages(ctx, "woocommerce", [
      { ...page, externalId: "42", slug: "cart", oldPath: "/cart/" },
    ]);
    expect(await findRedirect(store, "/cart/")).toBe("/cart-page");
  });
});
