import {
  type ImportedPage,
  type PageBlock,
  pageBlocksSchema,
  reservedPageSlugs,
} from "@monaztore/contracts";
import { and, asc, desc, eq, schema, sql } from "@monaztore/db";
import { DomainError, NotFoundError } from "./errors";
import {
  cleanHtml,
  listStoreProducts,
  type ProductCard,
  type StorefrontContext,
} from "./storefront";
import type { TenantContext } from "./tenant";

export type PageStatus = "draft" | "published";

export interface PageInput {
  title: string;
  slug: string;
  seoTitle: string;
  seoDescription: string;
  blocks: PageBlock[];
  status: PageStatus;
}

export interface PageSummary {
  id: string;
  title: string;
  slug: string;
  status: PageStatus;
  updatedAt: Date;
}

export interface StorePage extends PageSummary {
  seoTitle: string | null;
  seoDescription: string | null;
  blocks: PageBlock[];
}

/** Where a page lives on the storefront. */
export const pagePath = (slug: string) => `/${slug}`;

function requireOwner(ctx: TenantContext) {
  if (ctx.role !== "owner") throw new DomainError("forbidden", "Only owners edit pages");
}

/**
 * Blocks as they are stored: checked against the schema again (core never trusts the caller)
 * and with every text block's HTML cleaned, so the storefront can draw it as it is.
 */
export function cleanBlocks(blocks: unknown): PageBlock[] {
  const parsed = pageBlocksSchema.safeParse(blocks);
  if (!parsed.success) throw new DomainError("invalid_blocks", "The page's blocks are not valid");
  return parsed.data.map((block) =>
    block.type === "text" ? { ...block, html: cleanHtml(block.html, { ownLinks: true }) } : block,
  );
}

function checkSlug(slug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || reservedPageSlugs.includes(slug)) {
    throw new DomainError("invalid_slug", `"${slug}" can't be a page's address`);
  }
}

const summary = {
  id: schema.page.id,
  title: schema.page.title,
  slug: schema.page.slug,
  status: schema.page.status,
  updatedAt: schema.page.updatedAt,
};

/** The store's pages, the latest edited first. Every member may see them. */
export async function listPages(ctx: TenantContext): Promise<PageSummary[]> {
  const rows = await ctx.db
    .select(summary)
    .from(schema.page)
    .where(eq(schema.page.organizationId, ctx.organizationId))
    .orderBy(desc(schema.page.updatedAt));
  return rows as PageSummary[];
}

export async function getPage(ctx: TenantContext, id: string): Promise<StorePage | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await ctx.db
    .select({
      ...summary,
      seoTitle: schema.page.seoTitle,
      seoDescription: schema.page.seoDescription,
      blocks: schema.page.blocks,
    })
    .from(schema.page)
    .where(and(eq(schema.page.organizationId, ctx.organizationId), eq(schema.page.id, id)));
  return row ? ({ ...row, blocks: row.blocks as PageBlock[] } as StorePage) : null;
}

async function slugTaken(ctx: TenantContext, slug: string, exceptId?: string) {
  const [row] = await ctx.db
    .select({ id: schema.page.id })
    .from(schema.page)
    .where(and(eq(schema.page.organizationId, ctx.organizationId), eq(schema.page.slug, slug)));
  return Boolean(row && row.id !== exceptId);
}

/** A new page. Its address must be free in the store. */
export async function createPage(ctx: TenantContext, input: PageInput): Promise<{ id: string }> {
  requireOwner(ctx);
  checkSlug(input.slug);
  if (await slugTaken(ctx, input.slug)) {
    throw new DomainError("slug_taken", `The store already has a page at /${input.slug}`);
  }
  const [row] = await ctx.db
    .insert(schema.page)
    .values({
      organizationId: ctx.organizationId,
      title: input.title,
      slug: input.slug,
      seoTitle: input.seoTitle || null,
      seoDescription: input.seoDescription || null,
      blocks: cleanBlocks(input.blocks),
      status: input.status,
      publishedAt: input.status === "published" ? new Date() : null,
    })
    .returning({ id: schema.page.id });
  if (!row) throw new Error("Failed to create the page");
  return row;
}

/**
 * Saves a page. When a published page changes its address, the old one moves to the new with a
 * 301, so shared links and search results keep working.
 */
export async function updatePage(ctx: TenantContext, id: string, input: PageInput): Promise<void> {
  requireOwner(ctx);
  checkSlug(input.slug);
  const current = await getPage(ctx, id);
  if (!current) throw new NotFoundError("Page");
  if (await slugTaken(ctx, input.slug, id)) {
    throw new DomainError("slug_taken", `The store already has a page at /${input.slug}`);
  }
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(schema.page)
      .set({
        title: input.title,
        slug: input.slug,
        seoTitle: input.seoTitle || null,
        seoDescription: input.seoDescription || null,
        blocks: cleanBlocks(input.blocks),
        status: input.status,
        publishedAt:
          input.status === "published" ? sql`coalesce(${schema.page.publishedAt}, now())` : null,
      })
      .where(and(eq(schema.page.organizationId, ctx.organizationId), eq(schema.page.id, id)));
    if (current.status === "published" && current.slug !== input.slug) {
      await tx
        .insert(schema.redirect)
        .values({
          organizationId: ctx.organizationId,
          fromPath: pagePath(current.slug),
          toPath: pagePath(input.slug),
        })
        .onConflictDoUpdate({
          target: [schema.redirect.organizationId, schema.redirect.fromPath],
          set: { toPath: pagePath(input.slug) },
        });
    }
  });
}

export async function deletePage(ctx: TenantContext, id: string): Promise<void> {
  requireOwner(ctx);
  if (!(await getPage(ctx, id))) throw new NotFoundError("Page");
  await ctx.db
    .delete(schema.page)
    .where(and(eq(schema.page.organizationId, ctx.organizationId), eq(schema.page.id, id)));
}

/**
 * Pages from another platform, matched by their id there: a second run updates them. A slug
 * already used by another page gets a number at the end.
 */
export async function importPages(
  ctx: TenantContext,
  source: string,
  pages: ImportedPage[],
): Promise<{ pages: number; redirects: number }> {
  requireOwner(ctx);
  let redirects = 0;
  for (const item of pages) {
    const [existing] = await ctx.db
      .select({ id: schema.page.id })
      .from(schema.page)
      .where(
        and(
          eq(schema.page.organizationId, ctx.organizationId),
          eq(schema.page.externalSource, source),
          eq(schema.page.externalId, item.externalId),
        ),
      );
    let slug = reservedPageSlugs.includes(item.slug) ? `${item.slug}-page` : item.slug;
    for (let n = 2; await slugTaken(ctx, slug, existing?.id); n++) slug = `${item.slug}-${n}`;
    const values = {
      title: item.title,
      slug,
      blocks: cleanBlocks(item.blocks),
      status: item.status,
      publishedAt: item.status === "published" ? new Date() : null,
    };
    if (existing) {
      await ctx.db.update(schema.page).set(values).where(eq(schema.page.id, existing.id));
    } else {
      await ctx.db.insert(schema.page).values({
        ...values,
        organizationId: ctx.organizationId,
        externalSource: source,
        externalId: item.externalId,
      });
    }
    const oldPath = item.oldPath;
    if (oldPath && oldPath !== pagePath(slug) && oldPath !== `${pagePath(slug)}/`) {
      await ctx.db
        .insert(schema.redirect)
        .values({ organizationId: ctx.organizationId, fromPath: oldPath, toPath: pagePath(slug) })
        .onConflictDoUpdate({
          target: [schema.redirect.organizationId, schema.redirect.fromPath],
          set: { toPath: pagePath(slug) },
        });
      redirects++;
    }
  }
  return { pages: pages.length, redirects };
}

// The storefront: only published pages.

const published = (organizationId: string) =>
  and(eq(schema.page.organizationId, organizationId), eq(schema.page.status, "published"));

/** Published pages, for the store's footer and sitemap. */
export async function listStorePages(
  ctx: StorefrontContext,
): Promise<{ slug: string; title: string; updatedAt: Date }[]> {
  return ctx.db
    .select({ slug: schema.page.slug, title: schema.page.title, updatedAt: schema.page.updatedAt })
    .from(schema.page)
    .where(published(ctx.store.organizationId))
    .orderBy(asc(schema.page.title))
    .limit(50);
}

export interface StorefrontPage {
  title: string;
  slug: string;
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt: Date;
  blocks: PageBlock[];
  /** The products of each products block, by the block's id. */
  products: Record<string, ProductCard[]>;
}

/** A published page by its address, with what its blocks show. */
export async function getStorePage(
  ctx: StorefrontContext,
  slug: string,
): Promise<StorefrontPage | null> {
  const [row] = await ctx.db
    .select({
      title: schema.page.title,
      slug: schema.page.slug,
      seoTitle: schema.page.seoTitle,
      seoDescription: schema.page.seoDescription,
      updatedAt: schema.page.updatedAt,
      blocks: schema.page.blocks,
    })
    .from(schema.page)
    .where(and(published(ctx.store.organizationId), eq(schema.page.slug, slug)));
  if (!row) return null;
  const blocks = row.blocks as PageBlock[];
  return { ...row, blocks, products: await blockProducts(ctx, blocks) };
}

/** The products a page's product blocks show; also for the editor's preview. */
export async function blockProducts(
  ctx: StorefrontContext,
  blocks: PageBlock[],
): Promise<Record<string, ProductCard[]>> {
  const entries = await Promise.all(
    blocks
      .filter((block) => block.type === "products")
      .map(async (block) => {
        const page = await listStoreProducts(ctx, {
          collection: block.collection || undefined,
        });
        return [block.id, page.products.slice(0, block.limit)] as const;
      }),
  );
  return Object.fromEntries(entries);
}

/** The products block's products as the workspace's editor previews them (active ones only). */
export function previewBlockProducts(
  ctx: TenantContext,
  blocks: PageBlock[],
): Promise<Record<string, ProductCard[]>> {
  const store = { organizationId: ctx.organizationId, name: "", slug: "", hostname: "" };
  return blockProducts({ db: ctx.db, store }, blocks);
}
