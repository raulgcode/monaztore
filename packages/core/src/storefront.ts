import type { CatalogQuery, CatalogSort } from "@monaztore/contracts";
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
  type SQL,
  schema,
  sql,
} from "@monaztore/db";
import sanitizeHtml from "sanitize-html";
import { digitalProductIds } from "./digital-products";
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

/**
 * Product HTML comes from the store (or an import): only formatting survives, never scripts.
 * Links open in a new tab, except, with `ownLinks`, those to the store's own pages (`/…`).
 */
export function cleanHtml(html: string, { ownLinks = false }: { ownLinks?: boolean } = {}): string {
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
      a: (tagName, attribs): sanitizeHtml.Tag => {
        const href = attribs.href ?? "";
        if (ownLinks && href.startsWith("/") && !href.startsWith("//")) {
          return { tagName, attribs: { href } };
        }
        return {
          tagName,
          attribs: {
            ...attribs,
            rel: "nofollow noopener",
            target: "_blank",
          } as sanitizeHtml.Attributes,
        };
      },
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
  sku: string | null;
  price: number | null;
  compareAtPrice: number | null;
  inStock: boolean;
  imageUrl: string | null;
  imageAlt: string;
  /** The second photo, shown when a pointer rests on the card (a look from another angle). */
  hoverImageUrl: string | null;
  /** The product's first option and its values ("Talla": S, M, L), for the card's line. */
  firstOption: { name: string; values: string[] } | null;
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
const fromPriceSql = sql`coalesce(
  (select min(pv.price) from product_variant pv where pv.product_id = "product"."id"),
  "product"."price")`;
const fromPrice = sql<number | null>`${fromPriceSql}`.mapWith((value) =>
  value === null ? null : Number(value),
);

/** On sale: the product, or one of its variants, has a regular price above its price. */
const onSaleSql = sql`("product"."compare_at_price" > "product"."price" or exists (
  select 1 from product_variant pv where pv.product_id = "product"."id"
  and pv.compare_at_price > pv.price))`;

const firstImage = (column: "url" | "alt") =>
  sql<string | null>`(select ${sql.raw(`pi.${column}`)} from product_image pi
   where pi.product_id = "product"."id" order by pi.position limit 1)`;

const secondImage = sql<string | null>`(select pi.url from product_image pi
   where pi.product_id = "product"."id" order by pi.position offset 1 limit 1)`;

const firstOption = sql<{ name: string; values: string[] } | null>`(select
   jsonb_build_object('name', po.name, 'values', po.values) from product_option po
   where po.product_id = "product"."id" order by po.position limit 1)`;

/** A product with any of `values` for the option `name` ("Talla": M or L). */
const hasOption = (name: string, values: string[]) =>
  sql`exists (select 1 from product_option po, jsonb_array_elements_text(po.values) v(value)
    where po.product_id = "product"."id" and po.name = ${name}
    and v.value in (${sql.join(
      values.map((value) => sql`${value}`),
      sql`, `,
    )}))`;

export interface ProductQuery extends Partial<Omit<CatalogQuery, "options">> {
  /** A collection's slug. */
  collection?: string;
  options?: Record<string, string[]>;
}

/** The collection and its subcollections (one level down), or undefined when it doesn't exist. */
async function collectionIds(ctx: StorefrontContext, slug: string) {
  const [found] = await ctx.db
    .select({ id: schema.category.id })
    .from(schema.category)
    .where(
      and(
        eq(schema.category.organizationId, ctx.store.organizationId),
        eq(schema.category.slug, slug),
      ),
    );
  if (!found) return undefined;
  const children = await ctx.db
    .select({ id: schema.category.id })
    .from(schema.category)
    .where(
      and(
        eq(schema.category.organizationId, ctx.store.organizationId),
        eq(schema.category.parentId, found.id),
      ),
    );
  return [found.id, ...children.map((child) => child.id)];
}

type Except = "price" | { option: string } | undefined;

/** The WHERE of a query; `except` leaves one filter out, for the counts of that filter. */
function conditions(
  ctx: StorefrontContext,
  query: ProductQuery,
  categories: string[] | undefined,
  except?: Except,
) {
  const filters: (SQL | undefined)[] = [visible(ctx.store.organizationId)];
  if (query.q?.trim()) {
    filters.push(ilike(schema.product.name, `%${query.q.trim().replace(/[%_\\]/g, "\\$&")}%`));
  }
  if (categories) {
    filters.push(
      inArray(
        schema.product.id,
        ctx.db
          .select({ id: schema.productCategory.productId })
          .from(schema.productCategory)
          .where(inArray(schema.productCategory.categoryId, categories)),
      ),
    );
  }
  if (except !== "price") {
    if (query.minPrice != null) filters.push(sql`${fromPriceSql} >= ${query.minPrice}`);
    if (query.maxPrice != null) filters.push(sql`${fromPriceSql} <= ${query.maxPrice}`);
  }
  if (query.inStock) filters.push(eq(schema.product.inStock, true));
  if (query.onSale) filters.push(onSaleSql);
  for (const [name, values] of Object.entries(query.options ?? {})) {
    if (values.length === 0) continue;
    if (typeof except === "object" && except.option === name) continue;
    filters.push(hasOption(name, values));
  }
  return and(...filters);
}

const orderings = {
  newest: [desc(schema.product.createdAt), asc(schema.product.name)],
  "price-asc": [sql`${fromPriceSql} asc nulls last`, asc(schema.product.name)],
  "price-desc": [sql`${fromPriceSql} desc nulls last`, asc(schema.product.name)],
  name: [asc(schema.product.name)],
} satisfies Record<CatalogSort, unknown[]>;

/**
 * Active products a page at a time: of one collection, a search, and the shopper's filters
 * (price, stock, on sale, options such as size), in the order they picked. Newest first.
 */
export async function listStoreProducts(
  ctx: StorefrontContext,
  query: ProductQuery = {},
  pageSize = STOREFRONT_PAGE_SIZE,
): Promise<ProductPage> {
  const categories = query.collection ? await collectionIds(ctx, query.collection) : undefined;
  if (query.collection && !categories) return { products: [], total: 0, page: 1, pages: 0 };
  const where = conditions(ctx, query, categories);
  const [totals] = await ctx.db.select({ total: count() }).from(schema.product).where(where);
  const total = totals?.total ?? 0;
  const pages = Math.ceil(total / pageSize);
  const current = Math.min(Math.max(1, Math.floor(query.page ?? 1)), Math.max(1, pages));
  const rows = await ctx.db
    .select({
      slug: schema.product.slug,
      name: schema.product.name,
      sku: schema.product.sku,
      price: fromPrice,
      compareAtPrice: schema.product.compareAtPrice,
      inStock: schema.product.inStock,
      imageUrl: firstImage("url"),
      imageAlt: firstImage("alt"),
      hoverImageUrl: secondImage,
      firstOption,
    })
    .from(schema.product)
    .where(where)
    .orderBy(...orderings[query.sort ?? "newest"])
    .limit(pageSize)
    .offset((current - 1) * pageSize);
  return {
    products: rows.map((row) => ({ ...row, imageAlt: row.imageAlt || row.name })),
    total,
    page: current,
    pages,
  };
}

/** Options a store uses on fewer products than this aren't worth a filter. */
const FACET_OPTIONS = 6;
const FACET_VALUES = 30;

export interface CatalogFacets {
  /** The cheapest and dearest product in the list, minor units; null without prices. */
  price: { min: number; max: number } | null;
  /** Each option the products have ("Talla", "Color"), its values and how many products. */
  options: { name: string; values: { value: string; count: number }[] }[];
  inStock: number;
  onSale: number;
}

/**
 * What the shopper can narrow the list to, Amazon style: each count is what they'd get by
 * adding that value to the other filters they already have on.
 */
export async function listStoreFacets(
  ctx: StorefrontContext,
  query: ProductQuery = {},
): Promise<CatalogFacets> {
  const categories = query.collection ? await collectionIds(ctx, query.collection) : undefined;
  if (query.collection && !categories) {
    return { price: null, options: [], inStock: 0, onSale: 0 };
  }
  const base = conditions(ctx, { q: query.q }, categories);
  const names = await ctx.db
    .select({
      name: schema.productOption.name,
      products: sql<number>`count(distinct ${schema.product.id})`.mapWith(Number),
    })
    .from(schema.productOption)
    .innerJoin(schema.product, eq(schema.product.id, schema.productOption.productId))
    .where(base)
    .groupBy(schema.productOption.name)
    .having(sql`count(distinct ${schema.product.id}) > 1`)
    .orderBy(sql`count(distinct ${schema.product.id}) desc`, asc(schema.productOption.name))
    .limit(FACET_OPTIONS);
  const [bounds, flags, ...options] = await Promise.all([
    ctx.db
      .select({
        min: sql<number | null>`min(${fromPriceSql})`.mapWith((v) =>
          v === null ? null : Number(v),
        ),
        max: sql<number | null>`max(${fromPriceSql})`.mapWith((v) =>
          v === null ? null : Number(v),
        ),
      })
      .from(schema.product)
      .where(conditions(ctx, query, categories, "price")),
    ctx.db
      .select({
        inStock: sql<number>`count(*) filter (where ${schema.product.inStock})`.mapWith(Number),
        onSale: sql<number>`count(*) filter (where ${onSaleSql})`.mapWith(Number),
      })
      .from(schema.product)
      .where(conditions(ctx, { ...query, inStock: false, onSale: false }, categories)),
    ...names.map(({ name }) =>
      ctx.db
        .select({
          value: sql<string>`v.value`,
          count: sql<number>`count(distinct ${schema.product.id})`.mapWith(Number),
        })
        .from(schema.productOption)
        .innerJoin(schema.product, eq(schema.product.id, schema.productOption.productId))
        .crossJoin(sql`jsonb_array_elements_text(${schema.productOption.values}) as v(value)`)
        .where(
          and(
            eq(schema.productOption.name, name),
            conditions(ctx, query, categories, { option: name }),
          ),
        )
        .groupBy(sql`v.value`)
        .orderBy(sql`v.value`)
        .limit(FACET_VALUES),
    ),
  ]);
  const price = bounds[0];
  return {
    price:
      price && price.min !== null && price.max !== null ? { min: price.min, max: price.max } : null,
    options: names
      .map(({ name }, i) => ({ name, values: sortOptionValues(options[i] ?? []) }))
      .filter((option) => option.values.length > 0),
    inStock: flags[0]?.inStock ?? 0,
    onSale: flags[0]?.onSale ?? 0,
  };
}

const sizeOrder = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

/** Sizes in the order people read them (S, M, L), numbers as numbers, the rest A–Z. */
export function sortOptionValues<T extends { value: string }>(values: T[]): T[] {
  const rank = (value: string) => {
    const size = sizeOrder.indexOf(value.toUpperCase());
    if (size >= 0) return [0, size] as const;
    const number = Number.parseFloat(value.replace(",", "."));
    if (Number.isFinite(number) && /^\d/.test(value)) return [1, number] as const;
    return [2, 0] as const;
  };
  return values.toSorted((a, b) => {
    const [x, y] = [rank(a.value), rank(b.value)];
    return x[0] - y[0] || x[1] - y[1] || a.value.localeCompare(b.value);
  });
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
  /** Delivered as files the shopper downloads once paid: nothing to ship. */
  digital: boolean;
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
  const [images, options, variants, collections, digital] = await Promise.all([
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
    digitalProductIds(ctx.db, ctx.store.organizationId, [product.id]),
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
    digital: digital.has(product.id),
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

/** The top collections, for the store's menu and the front page's tiles. */
export function listTopCollections(ctx: StorefrontContext) {
  return ctx.db
    .select({
      slug: schema.category.slug,
      name: schema.category.name,
      imageUrl: schema.category.imageUrl,
    })
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
  const [products, collections, pages] = await Promise.all([
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
    ctx.db
      .select({ slug: schema.page.slug, updatedAt: schema.page.updatedAt })
      .from(schema.page)
      .where(
        and(
          eq(schema.page.organizationId, ctx.store.organizationId),
          eq(schema.page.status, "published"),
        ),
      )
      .orderBy(asc(schema.page.slug)),
  ]);
  return [
    ...pages.map((p) => ({ path: `/${p.slug}`, updatedAt: p.updatedAt })),
    ...collections.map((c) => ({ path: `/collections/${c.slug}`, updatedAt: c.updatedAt })),
    ...products.map((p) => ({ path: `/products/${p.slug}`, updatedAt: p.updatedAt })),
  ];
}
