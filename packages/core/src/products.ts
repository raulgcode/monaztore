import {
  ADMIN_PRODUCTS_PAGE_SIZE,
  LOW_STOCK,
  type ProductAttribute,
  type ProductInput,
  type ProductListQuery,
  type ProductStatus,
  pageSlugOf,
  variantKey,
} from "@monaztore/contracts";
import {
  and,
  asc,
  count,
  type Database,
  desc,
  eq,
  ilike,
  inArray,
  ne,
  or,
  type SQL,
  schema,
  sql,
} from "@monaztore/db";
import { DomainError, NotFoundError } from "./errors";
import type { TenantContext } from "./tenant";

/**
 * The store's products as the workspace manages them: the list with its filters and bulk
 * actions, and the editor that saves everything a product has in one go. Any member of the team
 * keeps the catalog; the files of a digital product stay with owners (`digital-products.ts`).
 */

export interface ProductRow {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  sku: string | null;
  imageUrl: string | null;
  /** The lowest price of the product or its variants, as stored (an offer when below `regular`). */
  price: number | null;
  regularPrice: number | null;
  /** The offer is running today. */
  onSale: boolean;
  inStock: boolean;
  /** What's left, adding up the variants; null when the store doesn't count it. */
  stock: number | null;
  variants: number;
  digital: boolean;
  categories: string[];
  updatedAt: Date;
}

export interface ProductList {
  products: ProductRow[];
  total: number;
  page: number;
  pages: number;
  /** How many of each status, for the filter's chips (without the other filters). */
  counts: Record<"all" | ProductStatus, number>;
}

const hasVariantsSql = sql`exists (select 1 from product_variant pv where pv.product_id = "product"."id")`;
const inStockSql = sql<boolean>`(case when ${hasVariantsSql}
  then exists (select 1 from product_variant pv where pv.product_id = "product"."id" and pv.in_stock)
  else "product"."in_stock" end)`;
const stockSql = sql<number | null>`(case when ${hasVariantsSql}
  then (select sum(pv.stock_quantity) from product_variant pv where pv.product_id = "product"."id")
  else "product"."stock_quantity" end)`;
const minPriceSql = sql`coalesce(
  (select min(pv.price) from product_variant pv where pv.product_id = "product"."id"),
  "product"."price")`;
const saleOnSql = sql`(("product"."sale_starts_at" is null or "product"."sale_starts_at" <= now())
  and ("product"."sale_ends_at" is null or "product"."sale_ends_at" > now()))`;
const offerSql = sql`("product"."compare_at_price" > "product"."price" or exists (
  select 1 from product_variant pv where pv.product_id = "product"."id" and pv.compare_at_price > pv.price))`;

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

function listConditions(ctx: TenantContext, query: ProductListQuery, withStatus = true) {
  const filters: (SQL | undefined)[] = [eq(schema.product.organizationId, ctx.organizationId)];
  if (withStatus && query.status !== "all") filters.push(eq(schema.product.status, query.status));
  if (query.q) {
    const like = `%${escapeLike(query.q)}%`;
    filters.push(
      or(
        ilike(schema.product.name, like),
        ilike(schema.product.sku, like),
        sql`exists (select 1 from product_variant pv where pv.product_id = "product"."id" and pv.sku ilike ${like})`,
      ),
    );
  }
  if (query.category) {
    filters.push(
      sql`exists (select 1 from product_category pc where pc.product_id = "product"."id" and pc.category_id = ${query.category})`,
    );
  }
  if (query.stock === "in") filters.push(sql`${inStockSql}`);
  if (query.stock === "out") filters.push(sql`not ${inStockSql}`);
  if (query.stock === "low") filters.push(sql`${stockSql} between 1 and ${LOW_STOCK}`);
  return and(...filters);
}

const listOrder = {
  newest: [desc(schema.product.createdAt), asc(schema.product.name)],
  name: [asc(schema.product.name)],
  "price-asc": [sql`${minPriceSql} asc nulls last`, asc(schema.product.name)],
  "price-desc": [sql`${minPriceSql} desc nulls last`, asc(schema.product.name)],
  stock: [sql`${stockSql} asc nulls last`, asc(schema.product.name)],
} satisfies Record<ProductListQuery["sort"], unknown[]>;

/** The products of the store a page at a time, searched (name or SKU) and filtered. */
export async function listProducts(
  ctx: TenantContext,
  query: ProductListQuery,
): Promise<ProductList> {
  const where = listConditions(ctx, query);
  const [[totals], statusCounts] = await Promise.all([
    ctx.db.select({ total: count() }).from(schema.product).where(where),
    ctx.db
      .select({ status: schema.product.status, total: count() })
      .from(schema.product)
      .where(listConditions(ctx, query, false))
      .groupBy(schema.product.status),
  ]);
  const total = totals?.total ?? 0;
  const pages = Math.ceil(total / ADMIN_PRODUCTS_PAGE_SIZE);
  const page = Math.min(Math.max(1, query.page), Math.max(1, pages));
  const rows = await ctx.db
    .select({
      id: schema.product.id,
      name: schema.product.name,
      slug: schema.product.slug,
      status: schema.product.status,
      sku: schema.product.sku,
      imageUrl: sql<
        string | null
      >`(select pi.url from product_image pi where pi.product_id = "product"."id" order by pi.position limit 1)`,
      price: sql<number | null>`${minPriceSql}`.mapWith((v) => (v === null ? null : Number(v))),
      compareAtPrice: schema.product.compareAtPrice,
      onSale: sql<boolean>`(${offerSql} and ${saleOnSql})`,
      inStock: inStockSql,
      stock: stockSql.mapWith((v) => (v === null ? null : Number(v))),
      variants:
        sql<number>`(select count(*) from product_variant pv where pv.product_id = "product"."id")`.mapWith(
          Number,
        ),
      digital: sql<boolean>`exists (select 1 from product_file pf where pf.product_id = "product"."id")`,
      categories: sql<
        string[]
      >`coalesce((select array_agg(c.name order by c.position, c.name) from product_category pc
        join category c on c.id = pc.category_id where pc.product_id = "product"."id"), '{}')`,
      updatedAt: schema.product.updatedAt,
    })
    .from(schema.product)
    .where(where)
    .orderBy(...listOrder[query.sort])
    .limit(ADMIN_PRODUCTS_PAGE_SIZE)
    .offset((page - 1) * ADMIN_PRODUCTS_PAGE_SIZE);
  const counts = { all: 0, active: 0, draft: 0, archived: 0 };
  for (const row of statusCounts) {
    if (row.status in counts) counts[row.status as ProductStatus] = row.total;
    counts.all += row.total;
  }
  return {
    products: rows.map(({ compareAtPrice, ...row }) => ({
      ...row,
      status: row.status as ProductStatus,
      regularPrice:
        compareAtPrice !== null && row.price !== null && compareAtPrice > row.price
          ? compareAtPrice
          : row.price,
    })),
    total,
    page,
    pages,
    counts,
  };
}

export interface EditableProduct {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  description: string;
  shortDescription: string;
  sku: string | null;
  price: number | null;
  compareAtPrice: number | null;
  saleStartsAt: Date | null;
  saleEndsAt: Date | null;
  stockQuantity: number | null;
  inStock: boolean;
  weightGrams: number | null;
  seoTitle: string | null;
  seoDescription: string | null;
  categoryIds: string[];
  images: { url: string; alt: string }[];
  attributes: ProductAttribute[];
  variants: {
    id: string;
    options: Record<string, string>;
    sku: string | null;
    price: number | null;
    compareAtPrice: number | null;
    stockQuantity: number | null;
    inStock: boolean;
    imageUrl: string | null;
  }[];
  /** Files it delivers (a digital product); managed in Digital products. */
  files: number;
}

/** One product of the store with everything the editor shows; undefined for another store's. */
export async function getEditableProduct(
  ctx: TenantContext,
  productId: string,
): Promise<EditableProduct | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return undefined;
  const [product] = await ctx.db
    .select()
    .from(schema.product)
    .where(
      and(eq(schema.product.organizationId, ctx.organizationId), eq(schema.product.id, productId)),
    );
  if (!product) return undefined;
  const [categories, images, options, variants, files] = await Promise.all([
    ctx.db
      .select({ id: schema.productCategory.categoryId })
      .from(schema.productCategory)
      .where(eq(schema.productCategory.productId, product.id)),
    ctx.db
      .select({ url: schema.productImage.url, alt: schema.productImage.alt })
      .from(schema.productImage)
      .where(eq(schema.productImage.productId, product.id))
      .orderBy(asc(schema.productImage.position)),
    ctx.db
      .select({
        name: schema.productOption.name,
        values: schema.productOption.values,
        variation: schema.productOption.variation,
      })
      .from(schema.productOption)
      .where(eq(schema.productOption.productId, product.id))
      .orderBy(asc(schema.productOption.position)),
    ctx.db
      .select({
        id: schema.productVariant.id,
        options: schema.productVariant.options,
        sku: schema.productVariant.sku,
        price: schema.productVariant.price,
        compareAtPrice: schema.productVariant.compareAtPrice,
        stockQuantity: schema.productVariant.stockQuantity,
        inStock: schema.productVariant.inStock,
        imageUrl: schema.productVariant.imageUrl,
      })
      .from(schema.productVariant)
      .where(eq(schema.productVariant.productId, product.id))
      .orderBy(asc(schema.productVariant.position)),
    ctx.db
      .select({ total: count() })
      .from(schema.productFile)
      .where(eq(schema.productFile.productId, product.id)),
  ]);
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    status: product.status as ProductStatus,
    description: product.description,
    shortDescription: product.shortDescription,
    sku: product.sku,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    saleStartsAt: product.saleStartsAt,
    saleEndsAt: product.saleEndsAt,
    stockQuantity: product.stockQuantity,
    inStock: product.inStock,
    weightGrams: product.weightGrams,
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    categoryIds: categories.map((row) => row.id),
    images,
    attributes: options,
    variants,
    files: files[0]?.total ?? 0,
  };
}

const productPath = (slug: string) => `/products/${slug}`;

/** A slug no other product of the store has: `camisa`, then `camisa-2`… */
async function freeSlug(db: Database, organizationId: string, wanted: string, except?: string) {
  const base = pageSlugOf(wanted) || "product";
  const taken = await db
    .select({ slug: schema.product.slug })
    .from(schema.product)
    .where(
      and(
        eq(schema.product.organizationId, organizationId),
        sql`(${schema.product.slug} = ${base} or ${schema.product.slug} like ${`${escapeLike(base)}-%`})`,
        except ? ne(schema.product.id, except) : undefined,
      ),
    );
  const used = new Set(taken.map((row) => row.slug));
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** SKUs repeated in the input, or already used by another product or variant of the store. */
async function takenSku(
  db: Database,
  organizationId: string,
  productId: string | null,
  skus: string[],
): Promise<string | null> {
  const seen = new Set<string>();
  for (const sku of skus) {
    const key = sku.toLowerCase();
    if (seen.has(key)) return sku;
    seen.add(key);
  }
  if (skus.length === 0) return null;
  const lower = skus.map((sku) => sku.toLowerCase());
  const other = productId ? ne(schema.product.id, productId) : undefined;
  const [onProduct] = await db
    .select({ sku: schema.product.sku })
    .from(schema.product)
    .where(
      and(
        eq(schema.product.organizationId, organizationId),
        other,
        inArray(sql`lower(${schema.product.sku})`, lower),
      ),
    )
    .limit(1);
  if (onProduct?.sku) return onProduct.sku;
  const [onVariant] = await db
    .select({ sku: schema.productVariant.sku })
    .from(schema.productVariant)
    .innerJoin(schema.product, eq(schema.product.id, schema.productVariant.productId))
    .where(
      and(
        eq(schema.product.organizationId, organizationId),
        other,
        inArray(sql`lower(${schema.productVariant.sku})`, lower),
      ),
    )
    .limit(1);
  return onVariant?.sku ?? null;
}

/**
 * The photos the product may show: the store's own files, and addresses it already had (an
 * import that couldn't copy a photo). Never another store's files or a new outside address.
 */
function checkImages(
  organizationId: string,
  images: ProductInput["images"],
  previous: Set<string>,
) {
  const own = `/media/organizations/${organizationId}/`;
  for (const image of images) {
    if (!image.url.startsWith(own) && !previous.has(image.url)) {
      throw new DomainError("image_invalid", "A photo isn't one of the store's files");
    }
  }
}

/** Every variant picks one value of each attribute the shopper chooses, without repeats. */
function checkVariants(input: ProductInput) {
  const picked = input.attributes.filter((attribute) => attribute.variation);
  const keys = new Set<string>();
  for (const variant of input.variants) {
    for (const [name, value] of Object.entries(variant.options)) {
      const attribute = picked.find((a) => a.name === name);
      if (!attribute?.values.includes(value)) {
        throw new DomainError(
          "variants_invalid",
          `A variant has ${name}: ${value}, which isn't an option`,
        );
      }
    }
    const key = variantKey(variant.options);
    if (keys.has(key))
      throw new DomainError("variants_invalid", "Two variants are the same combination");
    keys.add(key);
    if (variant.imageUrl && !input.images.some((image) => image.url === variant.imageUrl)) {
      throw new DomainError("variants_invalid", "A variant's photo isn't one of the product's");
    }
  }
}

/**
 * Creates (`productId` null) or saves a product with everything the editor sends, in one
 * transaction: photos, attributes, variants (kept by id, so carts and orders still find them)
 * and collections. A published product that changes address leaves a 301 from the old one.
 * Returns its id.
 */
export async function saveProduct(
  ctx: TenantContext,
  productId: string | null,
  input: ProductInput,
): Promise<string> {
  checkVariants(input);
  return ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Database;
    const [current] = productId
      ? await tx
          .select({
            id: schema.product.id,
            slug: schema.product.slug,
            status: schema.product.status,
          })
          .from(schema.product)
          .where(
            and(
              eq(schema.product.organizationId, ctx.organizationId),
              eq(schema.product.id, productId),
            ),
          )
          .for("update")
      : [];
    if (productId && !current) throw new NotFoundError("Product");

    const wantedSlug = pageSlugOf(input.slug || input.name) || "product";
    let slug = wantedSlug;
    if (input.slug && current?.slug !== wantedSlug) {
      const [clash] = await tx
        .select({ id: schema.product.id })
        .from(schema.product)
        .where(
          and(
            eq(schema.product.organizationId, ctx.organizationId),
            eq(schema.product.slug, wantedSlug),
            productId ? ne(schema.product.id, productId) : undefined,
          ),
        );
      if (clash)
        throw new DomainError("slug_taken", `Another product is at /products/${wantedSlug}`);
    } else if (!input.slug) {
      slug = await freeSlug(db, ctx.organizationId, input.name, productId ?? undefined);
    }

    const skus = [input.sku, ...input.variants.map((v) => v.sku)].filter((s): s is string => !!s);
    const sku = await takenSku(db, ctx.organizationId, productId, skus);
    if (sku) throw new DomainError("sku_taken", sku);

    const previous = productId
      ? await tx
          .select({ url: schema.productImage.url })
          .from(schema.productImage)
          .where(eq(schema.productImage.productId, productId))
      : [];
    checkImages(ctx.organizationId, input.images, new Set(previous.map((row) => row.url)));

    const hasVariants = input.variants.length > 0;
    const values = {
      name: input.name,
      slug,
      status: input.status,
      description: input.description,
      shortDescription: input.shortDescription,
      sku: input.sku,
      price: input.price,
      compareAtPrice: input.compareAtPrice,
      saleStartsAt: input.saleStartsAt,
      saleEndsAt: input.saleEndsAt,
      stockQuantity: hasVariants ? null : input.stockQuantity,
      inStock: hasVariants ? input.variants.some((v) => v.inStock) : input.inStock,
      weightGrams: input.weightGrams,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
    };
    let id: string;
    if (current) {
      id = current.id;
      await tx.update(schema.product).set(values).where(eq(schema.product.id, id));
      if (current.status === "active" && current.slug !== slug) {
        const from = productPath(current.slug);
        const to = productPath(slug);
        // Older addresses that pointed to the old one go straight to the new one.
        await tx
          .update(schema.redirect)
          .set({ toPath: to })
          .where(
            and(
              eq(schema.redirect.organizationId, ctx.organizationId),
              eq(schema.redirect.toPath, from),
            ),
          );
        await tx
          .insert(schema.redirect)
          .values({ organizationId: ctx.organizationId, fromPath: from, toPath: to })
          .onConflictDoUpdate({
            target: [schema.redirect.organizationId, schema.redirect.fromPath],
            set: { toPath: to },
          });
      }
      // The new address is a product again, not a redirect.
      await tx
        .delete(schema.redirect)
        .where(
          and(
            eq(schema.redirect.organizationId, ctx.organizationId),
            eq(schema.redirect.fromPath, productPath(slug)),
          ),
        );
    } else {
      const [created] = await tx
        .insert(schema.product)
        .values({ organizationId: ctx.organizationId, ...values })
        .returning({ id: schema.product.id });
      if (!created) throw new Error("Product not created");
      id = created.id;
    }

    // Collections: only the store's own.
    const categoryIds = input.categoryIds.length
      ? (
          await tx
            .select({ id: schema.category.id })
            .from(schema.category)
            .where(
              and(
                eq(schema.category.organizationId, ctx.organizationId),
                inArray(schema.category.id, input.categoryIds),
              ),
            )
        ).map((row) => row.id)
      : [];
    await tx.delete(schema.productCategory).where(eq(schema.productCategory.productId, id));
    if (categoryIds.length) {
      await tx
        .insert(schema.productCategory)
        .values(categoryIds.map((categoryId) => ({ productId: id, categoryId })));
    }

    await tx.delete(schema.productImage).where(eq(schema.productImage.productId, id));
    if (input.images.length) {
      await tx
        .insert(schema.productImage)
        .values(
          input.images.map((image, position) => ({
            productId: id,
            url: image.url,
            alt: image.alt,
            position,
          })),
        );
    }

    await tx.delete(schema.productOption).where(eq(schema.productOption.productId, id));
    if (input.attributes.length) {
      await tx.insert(schema.productOption).values(
        input.attributes.map((attribute, position) => ({
          productId: id,
          name: attribute.name,
          values: attribute.values,
          variation: attribute.variation,
          position,
        })),
      );
    }

    const existing = await tx
      .select({ id: schema.productVariant.id })
      .from(schema.productVariant)
      .where(eq(schema.productVariant.productId, id));
    const existingIds = new Set(existing.map((row) => row.id));
    const kept = new Set<string>();
    for (const [position, variant] of input.variants.entries()) {
      const variantValues = {
        options: variant.options,
        sku: variant.sku,
        price: variant.price,
        compareAtPrice: variant.compareAtPrice,
        stockQuantity: variant.stockQuantity,
        inStock: variant.inStock,
        imageUrl: variant.imageUrl,
        position,
      };
      if (variant.id && existingIds.has(variant.id) && !kept.has(variant.id)) {
        kept.add(variant.id);
        await tx
          .update(schema.productVariant)
          .set(variantValues)
          .where(eq(schema.productVariant.id, variant.id));
      } else {
        await tx.insert(schema.productVariant).values({ productId: id, ...variantValues });
      }
    }
    const gone = [...existingIds].filter((variantId) => !kept.has(variantId));
    if (gone.length)
      await tx.delete(schema.productVariant).where(inArray(schema.productVariant.id, gone));
    return id;
  });
}

/** Ids of these that are the store's own products. */
async function ownIds(db: Database, organizationId: string, ids: readonly string[]) {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: schema.product.id })
    .from(schema.product)
    .where(
      and(eq(schema.product.organizationId, organizationId), inArray(schema.product.id, [...ids])),
    );
  return rows.map((row) => row.id);
}

/**
 * The list's bulk actions on the selected products: publish, draft, hide (archive), delete, add
 * to a collection, or put on offer at a percentage off the regular price (0 ends the offer).
 * Returns how many products it changed.
 */
export async function bulkUpdateProducts(
  ctx: TenantContext,
  input: {
    action: "publish" | "draft" | "archive" | "delete" | "addCategory" | "offer";
    ids: string[];
    categoryId?: string;
    percent?: number;
  },
): Promise<number> {
  return ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Database;
    const ids = await ownIds(db, ctx.organizationId, input.ids);
    if (ids.length === 0) return 0;
    const statusOf = { publish: "active", draft: "draft", archive: "archived" } as const;
    switch (input.action) {
      case "publish":
      case "draft":
      case "archive":
        await tx
          .update(schema.product)
          .set({ status: statusOf[input.action] })
          .where(inArray(schema.product.id, ids));
        return ids.length;
      case "delete":
        await tx.delete(schema.product).where(inArray(schema.product.id, ids));
        return ids.length;
      case "addCategory": {
        const [category] = input.categoryId
          ? await tx
              .select({ id: schema.category.id })
              .from(schema.category)
              .where(
                and(
                  eq(schema.category.organizationId, ctx.organizationId),
                  eq(schema.category.id, input.categoryId),
                ),
              )
          : [];
        if (!category) throw new DomainError("not_found", "No such collection");
        await tx
          .insert(schema.productCategory)
          .values(ids.map((productId) => ({ productId, categoryId: category.id })))
          .onConflictDoNothing();
        return ids.length;
      }
      case "offer": {
        const percent = Math.min(90, Math.max(0, Math.trunc(input.percent ?? 0)));
        // The regular price is the crossed-out one when there's an offer, else the price.
        const regular = (price: SQL, compare: SQL) =>
          sql`(case when ${compare} > ${price} then ${compare} else ${price} end)`;
        const productRegular = regular(
          sql`${schema.product.price}`,
          sql`${schema.product.compareAtPrice}`,
        );
        const variantRegular = regular(
          sql`${schema.productVariant.price}`,
          sql`${schema.productVariant.compareAtPrice}`,
        );
        if (percent === 0) {
          await tx
            .update(schema.product)
            .set({
              price: productRegular,
              compareAtPrice: null,
              saleStartsAt: null,
              saleEndsAt: null,
            })
            .where(inArray(schema.product.id, ids));
          await tx
            .update(schema.productVariant)
            .set({ price: variantRegular, compareAtPrice: null })
            .where(inArray(schema.productVariant.productId, ids));
        } else {
          const off = (base: SQL) => sql`round(${base} * ${100 - percent} / 100.0)::bigint`;
          await tx
            .update(schema.product)
            .set({
              price: sql`${off(productRegular)}`,
              compareAtPrice: productRegular,
              saleStartsAt: null,
              saleEndsAt: null,
            })
            .where(and(inArray(schema.product.id, ids), sql`${schema.product.price} is not null`));
          await tx
            .update(schema.productVariant)
            .set({ price: sql`${off(variantRegular)}`, compareAtPrice: variantRegular })
            .where(
              and(
                inArray(schema.productVariant.productId, ids),
                sql`${schema.productVariant.price} is not null`,
              ),
            );
        }
        return ids.length;
      }
    }
  });
}

/** "Duplicate": a draft copy with the same photos, attributes, variants and collections. */
export async function duplicateProduct(ctx: TenantContext, productId: string): Promise<string> {
  const product = await getEditableProduct(ctx, productId);
  if (!product) throw new NotFoundError("Product");
  return ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Database;
    const [created] = await tx
      .insert(schema.product)
      .values({
        organizationId: ctx.organizationId,
        name: `${product.name} (copy)`.slice(0, 200),
        slug: await freeSlug(db, ctx.organizationId, `${product.slug}-copy`),
        status: "draft",
        description: product.description,
        shortDescription: product.shortDescription,
        sku: null,
        price: product.price,
        compareAtPrice: product.compareAtPrice,
        saleStartsAt: product.saleStartsAt,
        saleEndsAt: product.saleEndsAt,
        stockQuantity: product.stockQuantity,
        inStock: product.inStock,
        weightGrams: product.weightGrams,
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
      })
      .returning({ id: schema.product.id });
    if (!created) throw new Error("Product not created");
    const id = created.id;
    if (product.categoryIds.length) {
      await tx
        .insert(schema.productCategory)
        .values(product.categoryIds.map((categoryId) => ({ productId: id, categoryId })));
    }
    if (product.images.length) {
      await tx
        .insert(schema.productImage)
        .values(product.images.map((image, position) => ({ productId: id, ...image, position })));
    }
    if (product.attributes.length) {
      await tx
        .insert(schema.productOption)
        .values(
          product.attributes.map((attribute, position) => ({
            productId: id,
            ...attribute,
            position,
          })),
        );
    }
    if (product.variants.length) {
      await tx
        .insert(schema.productVariant)
        .values(
          product.variants.map(({ id: _id, sku: _sku, ...variant }, position) => ({
            productId: id,
            ...variant,
            position,
          })),
        );
    }
    return id;
  });
}

// ── Collections ──────────────────────────────────────────────────────────────────────────────

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  products: number;
}

/** The store's collections (WooCommerce's categories), parents before their children. */
export async function listCategories(ctx: TenantContext): Promise<CategoryRow[]> {
  const rows = await ctx.db
    .select({
      id: schema.category.id,
      name: schema.category.name,
      slug: schema.category.slug,
      parentId: schema.category.parentId,
      products:
        sql<number>`(select count(*) from product_category pc where pc.category_id = ${schema.category.id})`.mapWith(
          Number,
        ),
    })
    .from(schema.category)
    .where(eq(schema.category.organizationId, ctx.organizationId))
    .orderBy(asc(schema.category.position), asc(schema.category.name), asc(schema.category.slug));
  const children = (parentId: string | null): CategoryRow[] =>
    rows.filter((row) => row.parentId === parentId).flatMap((row) => [row, ...children(row.id)]);
  const ordered = children(null);
  // Anything whose parent is gone still shows, at the end.
  return [...ordered, ...rows.filter((row) => !ordered.includes(row))];
}

/** A new collection; its address comes from its name (`/collections/camisas`). */
export async function createCategory(
  ctx: TenantContext,
  input: { name: string; parentId?: string | null },
): Promise<{ id: string; name: string; slug: string }> {
  const parentId = input.parentId || null;
  if (parentId) {
    const [parent] = await ctx.db
      .select({ id: schema.category.id })
      .from(schema.category)
      .where(
        and(
          eq(schema.category.organizationId, ctx.organizationId),
          eq(schema.category.id, parentId),
        ),
      );
    if (!parent) throw new DomainError("not_found", "No such collection");
  }
  const base = pageSlugOf(input.name) || "collection";
  const taken = await ctx.db
    .select({ slug: schema.category.slug })
    .from(schema.category)
    .where(
      and(
        eq(schema.category.organizationId, ctx.organizationId),
        sql`(${schema.category.slug} = ${base} or ${schema.category.slug} like ${`${escapeLike(base)}-%`})`,
      ),
    );
  const used = new Set(taken.map((row) => row.slug));
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
  const [created] = await ctx.db
    .insert(schema.category)
    .values({ organizationId: ctx.organizationId, name: input.name, slug, parentId })
    .returning({ id: schema.category.id, name: schema.category.name, slug: schema.category.slug });
  if (!created) throw new Error("Collection not created");
  return created;
}

/** Renames a collection; its address stays, so links to it keep working. */
export async function renameCategory(
  ctx: TenantContext,
  categoryId: string,
  name: string,
): Promise<void> {
  const updated = await ctx.db
    .update(schema.category)
    .set({ name })
    .where(
      and(
        eq(schema.category.organizationId, ctx.organizationId),
        eq(schema.category.id, categoryId),
      ),
    )
    .returning({ id: schema.category.id });
  if (updated.length === 0) throw new NotFoundError("Collection");
}

/** Deletes a collection: its products stay, without it; its children move up a level. */
export async function deleteCategory(ctx: TenantContext, categoryId: string): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    const [found] = await tx
      .select({ id: schema.category.id, parentId: schema.category.parentId })
      .from(schema.category)
      .where(
        and(
          eq(schema.category.organizationId, ctx.organizationId),
          eq(schema.category.id, categoryId),
        ),
      );
    if (!found) throw new NotFoundError("Collection");
    await tx
      .update(schema.category)
      .set({ parentId: found.parentId })
      .where(
        and(
          eq(schema.category.organizationId, ctx.organizationId),
          eq(schema.category.parentId, found.id),
        ),
      );
    await tx.delete(schema.category).where(eq(schema.category.id, found.id));
  });
}

/** Attribute names the store already uses ("Talla", "Color"), to suggest them in the editor. */
export async function listAttributeNames(
  ctx: TenantContext,
): Promise<{ name: string; values: string[] }[]> {
  const rows = await ctx.db
    .select({
      name: schema.productOption.name,
      values: sql<string[]>`array(select distinct v from product_option po2
        join product p2 on p2.id = po2.product_id, jsonb_array_elements_text(po2.values) v
        where p2.organization_id = ${ctx.organizationId} and po2.name = ${schema.productOption.name}
        order by v limit 60)`,
    })
    .from(schema.productOption)
    .innerJoin(schema.product, eq(schema.product.id, schema.productOption.productId))
    .where(eq(schema.product.organizationId, ctx.organizationId))
    .groupBy(schema.productOption.name)
    .orderBy(sql`count(*) desc`, asc(schema.productOption.name))
    .limit(30);
  return rows;
}

/** Products by name or SKU, to pick them (a coupon's products). At most 20. */
export async function searchProducts(
  ctx: TenantContext,
  query: string,
  ids: readonly string[] = [],
): Promise<{ id: string; name: string; sku: string | null }[]> {
  const q = query.trim().slice(0, 100);
  const filters: SQL[] = [];
  if (q) {
    const like = `%${escapeLike(q)}%`;
    const match = or(ilike(schema.product.name, like), ilike(schema.product.sku, like));
    if (match) filters.push(match);
  }
  if (ids.length) filters.push(inArray(schema.product.id, [...ids]));
  if (filters.length === 0) return [];
  return ctx.db
    .select({ id: schema.product.id, name: schema.product.name, sku: schema.product.sku })
    .from(schema.product)
    .where(and(eq(schema.product.organizationId, ctx.organizationId), or(...filters)))
    .orderBy(asc(schema.product.name))
    .limit(ids.length ? Math.max(20, ids.length) : 20);
}
