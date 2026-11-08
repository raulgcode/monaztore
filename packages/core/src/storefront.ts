import {
  and,
  asc,
  count,
  type Database,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  schema,
  sql,
} from "@monaztore/db";
import sanitizeHtml from "sanitize-html";
import type { StorefrontStore } from "./stores";

/**
 * What the public storefront reads: one store, found by its Host (`resolveStoreByHost`), with no
 * signed-in member. Only what a visitor may see: active products, never drafts or customers.
 */
export interface StorefrontContext {
  db: Database;
  store: StorefrontStore;
}

export const STOREFRONT_PAGE_SIZE = 24;

/** Product HTML comes from the store (or an import): only formatting survives, never scripts. */
export function cleanHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "ul",
      "ol",
      "li",
      "h2",
      "h3",
      "h4",
      "blockquote",
      "a",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "span",
    ],
    allowedAttributes: { a: ["href", "title", "rel", "target"] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "nofollow noopener", target: "_blank" }),
    },
  });
}

/** Plain text from HTML, for descriptions in search results and previews. */
export function plainText(html: string, max = 160): string {
  const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export interface StoreInfo {
  name: string;
  currency: string;
  /** Where canonical links point: the primary domain, or the one that answered. */
  canonicalHost: string;
}

export async function getStoreInfo(ctx: StorefrontContext): Promise<StoreInfo> {
  const [settings] = await ctx.db
    .select({ currency: schema.storeSettings.currency })
    .from(schema.storeSettings)
    .where(eq(schema.storeSettings.organizationId, ctx.store.organizationId));
  const [primary] = await ctx.db
    .select({ hostname: schema.storeDomain.hostname })
    .from(schema.storeDomain)
    .where(
      and(
        eq(schema.storeDomain.organizationId, ctx.store.organizationId),
        eq(schema.storeDomain.primary, true),
      ),
    )
    .limit(1);
  return {
    name: ctx.store.name,
    currency: settings?.currency ?? "CRC",
    canonicalHost: primary?.hostname ?? ctx.store.hostname,
  };
}

export interface ProductCard {
  slug: string;
  name: string;
  price: number | null;
  compareAtPrice: number | null;
  inStock: boolean;
  imageUrl: string | null;
  imageAlt: string;
}

export interface ProductPage {
  products: ProductCard[];
  total: number;
  page: number;
  pages: number;
}

const visible = (organizationId: string) =>
  and(eq(schema.product.organizationId, organizationId), eq(schema.product.status, "active"));

/** The lowest price among a product and its variants: "from ₡10 000". */
const fromPrice = sql<number | null>`coalesce(
  (select min(pv.price) from product_variant pv where pv.product_id = "product"."id"),
  "product"."price")`.mapWith((value) => (value === null ? null : Number(value)));

const firstImage = (column: "url" | "alt") =>
  sql<string | null>`(select ${sql.raw(`pi.${column}`)} from product_image pi
   where pi.product_id = "product"."id" order by pi.position limit 1)`;

export interface ProductQuery {
  /** A collection's slug. */
  collection?: string;
  /** Words in the name. */
  q?: string;
  page?: number;
}

/** Active products, newest first, a page at a time; optionally of one collection or a search. */
export async function listStoreProducts(
  ctx: StorefrontContext,
  { collection, q, page = 1 }: ProductQuery = {},
): Promise<ProductPage> {
  const filters = [visible(ctx.store.organizationId)];
  if (q?.trim())
    filters.push(ilike(schema.product.name, `%${q.trim().replace(/[%_\\]/g, "\\$&")}%`));
  if (collection) {
    const [found] = await ctx.db
      .select({ id: schema.category.id })
      .from(schema.category)
      .where(
        and(
          eq(schema.category.organizationId, ctx.store.organizationId),
          eq(schema.category.slug, collection),
        ),
      );
    if (!found) return { products: [], total: 0, page: 1, pages: 0 };
    // A collection also shows what is in its subcollections, one level down.
    const children = await ctx.db
      .select({ id: schema.category.id })
      .from(schema.category)
      .where(
        and(
          eq(schema.category.organizationId, ctx.store.organizationId),
          eq(schema.category.parentId, found.id),
        ),
      );
    const ids = [found.id, ...children.map((child) => child.id)];
    filters.push(
      inArray(
        schema.product.id,
        ctx.db
          .select({ id: schema.productCategory.productId })
          .from(schema.productCategory)
          .where(inArray(schema.productCategory.categoryId, ids)),
      ),
    );
  }
  const where = and(...filters);
  const [totals] = await ctx.db.select({ total: count() }).from(schema.product).where(where);
  const total = totals?.total ?? 0;
  const pages = Math.ceil(total / STOREFRONT_PAGE_SIZE);
  const current = Math.min(Math.max(1, Math.floor(page)), Math.max(1, pages));
  const rows = await ctx.db
    .select({
      slug: schema.product.slug,
      name: schema.product.name,
      price: fromPrice,
      compareAtPrice: schema.product.compareAtPrice,
      inStock: schema.product.inStock,
      imageUrl: firstImage("url"),
      imageAlt: firstImage("alt"),
    })
    .from(schema.product)
    .where(where)
    .orderBy(desc(schema.product.createdAt), asc(schema.product.name))
    .limit(STOREFRONT_PAGE_SIZE)
    .offset((current - 1) * STOREFRONT_PAGE_SIZE);
  return {
    products: rows.map((row) => ({ ...row, imageAlt: row.imageAlt || row.name })),
    total,
    page: current,
    pages,
  };
}

export interface StoreProduct {
  id: string;
  slug: string;
  name: string;
  descriptionHtml: string;
  summary: string;
  sku: string | null;
  price: number | null;
  compareAtPrice: number | null;
  inStock: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  images: { url: string; alt: string }[];
  options: { name: string; values: string[] }[];
  variants: {
    id: string;
    sku: string | null;
    options: Record<string, string>;
    price: number | null;
    compareAtPrice: number | null;
    inStock: boolean;
  }[];
  collections: { slug: string; name: string }[];
}

/** One active product by its slug, with what its page shows. Undefined for drafts too. */
export async function getStoreProduct(
  ctx: StorefrontContext,
  slug: string,
): Promise<StoreProduct | undefined> {
  const [product] = await ctx.db
    .select()
    .from(schema.product)
    .where(and(visible(ctx.store.organizationId), eq(schema.product.slug, slug)));
  if (!product) return undefined;
  const [images, options, variants, collections] = await Promise.all([
    ctx.db
      .select({ url: schema.productImage.url, alt: schema.productImage.alt })
      .from(schema.productImage)
      .where(eq(schema.productImage.productId, product.id))
      .orderBy(asc(schema.productImage.position)),
    ctx.db
      .select({ name: schema.productOption.name, values: schema.productOption.values })
      .from(schema.productOption)
      .where(eq(schema.productOption.productId, product.id))
      .orderBy(asc(schema.productOption.position)),
    ctx.db
      .select({
        id: schema.productVariant.id,
        sku: schema.productVariant.sku,
        options: schema.productVariant.options,
        price: schema.productVariant.price,
        compareAtPrice: schema.productVariant.compareAtPrice,
        inStock: schema.productVariant.inStock,
      })
      .from(schema.productVariant)
      .where(eq(schema.productVariant.productId, product.id))
      .orderBy(asc(schema.productVariant.position)),
    ctx.db
      .select({ slug: schema.category.slug, name: schema.category.name })
      .from(schema.productCategory)
      .innerJoin(schema.category, eq(schema.category.id, schema.productCategory.categoryId))
      .where(eq(schema.productCategory.productId, product.id))
      .orderBy(asc(schema.category.position), asc(schema.category.name)),
  ]);
  const prices = variants.map((v) => v.price).filter((p): p is number => p !== null);
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    descriptionHtml: cleanHtml(product.description),
    summary: plainText(product.shortDescription || product.description),
    sku: product.sku,
    price: prices.length > 0 ? Math.min(...prices) : product.price,
    compareAtPrice: product.compareAtPrice,
    inStock: variants.length > 0 ? variants.some((v) => v.inStock) : product.inStock,
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    images: images.map((image) => ({ url: image.url, alt: image.alt || product.name })),
    options,
    variants,
    collections,
  };
}

export interface StoreCollection {
  slug: string;
  name: string;
  descriptionHtml: string;
  summary: string;
  imageUrl: string | null;
  parent: { slug: string; name: string } | null;
}

export async function getStoreCollection(
  ctx: StorefrontContext,
  slug: string,
): Promise<StoreCollection | undefined> {
  const [found] = await ctx.db
    .select()
    .from(schema.category)
    .where(
      and(
        eq(schema.category.organizationId, ctx.store.organizationId),
        eq(schema.category.slug, slug),
      ),
    );
  if (!found) return undefined;
  const [parent] = found.parentId
    ? await ctx.db
        .select({ slug: schema.category.slug, name: schema.category.name })
        .from(schema.category)
        .where(
          and(
            eq(schema.category.organizationId, ctx.store.organizationId),
            eq(schema.category.id, found.parentId),
          ),
        )
    : [];
  return {
    slug: found.slug,
    name: found.name,
    descriptionHtml: cleanHtml(found.description),
    summary: plainText(found.description),
    imageUrl: found.imageUrl,
    parent: parent ?? null,
  };
}

/** The top collections, for the store's menu. */
export function listTopCollections(ctx: StorefrontContext) {
  return ctx.db
    .select({ slug: schema.category.slug, name: schema.category.name })
    .from(schema.category)
    .where(
      and(
        eq(schema.category.organizationId, ctx.store.organizationId),
        isNull(schema.category.parentId),
      ),
    )
    .orderBy(asc(schema.category.position), asc(schema.category.name))
    .limit(12);
}

/**
 * Where an old address moved, for a 301: exact path first, then with or without the trailing
 * slash WordPress uses.
 */
export async function findRedirect(
  ctx: StorefrontContext,
  path: string,
): Promise<string | undefined> {
  const candidates = [path, path.endsWith("/") ? path.slice(0, -1) : `${path}/`].filter(Boolean);
  const rows = await ctx.db
    .select({ fromPath: schema.redirect.fromPath, toPath: schema.redirect.toPath })
    .from(schema.redirect)
    .where(
      and(
        eq(schema.redirect.organizationId, ctx.store.organizationId),
        inArray(schema.redirect.fromPath, candidates),
      ),
    );
  return (rows.find((row) => row.fromPath === path) ?? rows[0])?.toPath;
}

export interface SitemapEntry {
  path: string;
  updatedAt: Date;
}

/** Every public page of the store, for /sitemap.xml. */
export async function sitemapEntries(ctx: StorefrontContext): Promise<SitemapEntry[]> {
  const [products, collections] = await Promise.all([
    ctx.db
      .select({ slug: schema.product.slug, updatedAt: schema.product.updatedAt })
      .from(schema.product)
      .where(visible(ctx.store.organizationId))
      .orderBy(asc(schema.product.slug))
      .limit(50_000),
    ctx.db
      .select({ slug: schema.category.slug, updatedAt: schema.category.updatedAt })
      .from(schema.category)
      .where(eq(schema.category.organizationId, ctx.store.organizationId))
      .orderBy(asc(schema.category.slug)),
  ]);
  return [
    ...collections.map((c) => ({ path: `/collections/${c.slug}`, updatedAt: c.updatedAt })),
    ...products.map((p) => ({ path: `/products/${p.slug}`, updatedAt: p.updatedAt })),
  ];
}
