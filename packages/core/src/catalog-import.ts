import type { ImportedCatalog } from "@monaztore/contracts";
import { and, type Database, eq, inArray, notInArray, schema, sql } from "@monaztore/db";
import { DomainError } from "./errors";
import type { TenantContext } from "./tenant";

export interface CatalogImportStats {
  categories: number;
  products: number;
  variants: number;
  images: number;
  customers: number;
  redirects: number;
}

export interface CatalogImportResult {
  runId: string;
  stats: CatalogImportStats;
  warnings: string[];
}

/** Where an imported product and category live in the new storefront. */
export const storefrontPaths = {
  product: (slug: string) => `/products/${slug}`,
  collection: (slug: string) => `/collections/${slug}`,
};

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Brings a catalog from another platform into the tenant's store. Safe to run again: rows are
 * matched by their id in the source, so a second run updates instead of duplicating, and what
 * the store edited by hand in rows that didn't come from this source is never touched.
 */
export async function importCatalog(
  ctx: TenantContext,
  catalog: ImportedCatalog,
): Promise<CatalogImportResult> {
  if (ctx.role !== "owner") throw new DomainError("forbidden", "Only owners import catalogs");

  const [run] = await ctx.db
    .insert(schema.importRun)
    .values({
      organizationId: ctx.organizationId,
      source: catalog.source,
      sourceUrl: catalog.sourceUrl,
      status: "running",
    })
    .returning({ id: schema.importRun.id });
  if (!run) throw new Error("Failed to start the import run");

  try {
    const stats = await ctx.db.transaction((tx) => writeCatalog(tx, ctx.organizationId, catalog));
    await ctx.db
      .update(schema.importRun)
      .set({ status: "succeeded", stats: { ...stats }, finishedAt: new Date() })
      .where(eq(schema.importRun.id, run.id));
    return { runId: run.id, stats, warnings: catalog.warnings };
  } catch (error) {
    await ctx.db
      .update(schema.importRun)
      .set({ status: "failed", error: (error as Error).message, finishedAt: new Date() })
      .where(eq(schema.importRun.id, run.id));
    throw error;
  }
}

/** Slugs are unique per store: one taken by a row from elsewhere gets `-2`, `-3`… */
function slugAllocator(taken: Map<string, string | null>) {
  return (slug: string, externalId: string): string => {
    let candidate = slug;
    for (let n = 2; ; n++) {
      const owner = taken.get(candidate);
      if (owner === undefined || owner === externalId) {
        taken.set(candidate, externalId);
        return candidate;
      }
      candidate = `${slug}-${n}`;
    }
  };
}

async function writeCatalog(
  tx: Tx,
  organizationId: string,
  catalog: ImportedCatalog,
): Promise<CatalogImportStats> {
  const source = catalog.source;
  const stats: CatalogImportStats = {
    categories: 0,
    products: 0,
    variants: 0,
    images: 0,
    customers: 0,
    redirects: 0,
  };

  await tx
    .insert(schema.storeSettings)
    .values({ organizationId, currency: catalog.currency })
    .onConflictDoUpdate({
      target: schema.storeSettings.organizationId,
      set: { currency: catalog.currency },
    });

  // Categories, then their parents once every id is known.
  const takenCategorySlugs = new Map(
    (
      await tx
        .select({ slug: schema.category.slug, externalId: schema.category.externalId })
        .from(schema.category)
        .where(eq(schema.category.organizationId, organizationId))
    ).map((row) => [row.slug, row.externalId]),
  );
  const categorySlug = slugAllocator(takenCategorySlugs);
  const categoryIds = new Map<string, string>();
  const redirects: { fromPath: string; toPath: string }[] = [];
  for (const item of catalog.categories) {
    const slug = categorySlug(item.slug, item.externalId);
    const values = {
      organizationId,
      slug,
      name: item.name,
      description: item.description,
      imageUrl: item.imageUrl,
      position: item.position,
      externalSource: source,
      externalId: item.externalId,
    };
    const [row] = await tx
      .insert(schema.category)
      .values(values)
      .onConflictDoUpdate({
        target: [
          schema.category.organizationId,
          schema.category.externalSource,
          schema.category.externalId,
        ],
        set: values,
      })
      .returning({ id: schema.category.id });
    if (!row) throw new Error(`Failed to import category ${item.externalId}`);
    categoryIds.set(item.externalId, row.id);
    if (item.oldPath)
      redirects.push({ fromPath: item.oldPath, toPath: storefrontPaths.collection(slug) });
    stats.categories++;
  }
  for (const item of catalog.categories) {
    const id = categoryIds.get(item.externalId);
    const parentId = item.parentExternalId
      ? (categoryIds.get(item.parentExternalId) ?? null)
      : null;
    if (id) await tx.update(schema.category).set({ parentId }).where(eq(schema.category.id, id));
  }

  const takenProductSlugs = new Map(
    (
      await tx
        .select({ slug: schema.product.slug, externalId: schema.product.externalId })
        .from(schema.product)
        .where(eq(schema.product.organizationId, organizationId))
    ).map((row) => [row.slug, row.externalId]),
  );
  const productSlug = slugAllocator(takenProductSlugs);
  for (const item of catalog.products) {
    const slug = productSlug(item.slug, item.externalId);
    const values = {
      organizationId,
      slug,
      name: item.name,
      description: item.description,
      shortDescription: item.shortDescription,
      status: item.status,
      sku: item.sku,
      price: item.price,
      compareAtPrice: item.compareAtPrice,
      stockQuantity: item.stockQuantity,
      inStock: item.inStock,
      weightGrams: item.weightGrams,
      seoTitle: item.seoTitle,
      seoDescription: item.seoDescription,
      externalSource: source,
      externalId: item.externalId,
    };
    const [row] = await tx
      .insert(schema.product)
      .values(values)
      .onConflictDoUpdate({
        target: [
          schema.product.organizationId,
          schema.product.externalSource,
          schema.product.externalId,
        ],
        set: values,
      })
      .returning({ id: schema.product.id });
    if (!row) throw new Error(`Failed to import product ${item.externalId}`);
    const productId = row.id;
    stats.products++;

    // Images, options and categories come whole from the source: replaced on every run.
    await tx.delete(schema.productImage).where(eq(schema.productImage.productId, productId));
    if (item.images.length > 0) {
      await tx
        .insert(schema.productImage)
        .values(item.images.map((image, position) => ({ productId, ...image, position })));
      stats.images += item.images.length;
    }
    await tx.delete(schema.productOption).where(eq(schema.productOption.productId, productId));
    if (item.options.length > 0) {
      await tx
        .insert(schema.productOption)
        .values(item.options.map((option, position) => ({ productId, ...option, position })));
    }
    await tx.delete(schema.productCategory).where(eq(schema.productCategory.productId, productId));
    const links = item.categoryExternalIds
      .map((externalId) => categoryIds.get(externalId))
      .filter((id): id is string => Boolean(id));
    if (links.length > 0) {
      await tx
        .insert(schema.productCategory)
        .values([...new Set(links)].map((categoryId) => ({ productId, categoryId })));
    }

    for (const [position, variant] of item.variants.entries()) {
      const variantValues = {
        productId,
        sku: variant.sku,
        options: variant.options,
        price: variant.price,
        compareAtPrice: variant.compareAtPrice,
        stockQuantity: variant.stockQuantity,
        inStock: variant.inStock,
        imageUrl: variant.imageUrl,
        position,
        externalSource: source,
        externalId: variant.externalId,
      };
      await tx
        .insert(schema.productVariant)
        .values(variantValues)
        .onConflictDoUpdate({
          target: [
            schema.productVariant.productId,
            schema.productVariant.externalSource,
            schema.productVariant.externalId,
          ],
          set: variantValues,
        });
      stats.variants++;
    }
    // Variants deleted in the source go away here too.
    const kept = item.variants.map((variant) => variant.externalId);
    await tx
      .delete(schema.productVariant)
      .where(
        and(
          eq(schema.productVariant.productId, productId),
          eq(schema.productVariant.externalSource, source),
          kept.length > 0 ? notInArray(schema.productVariant.externalId, kept) : undefined,
        ),
      );

    if (item.oldPath)
      redirects.push({ fromPath: item.oldPath, toPath: storefrontPaths.product(slug) });
  }

  for (const item of catalog.customers) {
    const email = item.email.trim().toLowerCase();
    const values = {
      organizationId,
      email,
      firstName: item.firstName,
      lastName: item.lastName,
      phone: item.phone,
      acceptsMarketing: item.acceptsMarketing,
      marketingConsentAt: item.acceptsMarketing ? new Date() : null,
      ordersCount: item.ordersCount,
      totalSpent: item.totalSpent,
      externalSource: source,
      externalId: item.externalId,
    };
    await tx
      .insert(schema.customer)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.customer.organizationId, schema.customer.email],
        set: {
          ...values,
          // An import never takes back consent the customer gave in the store.
          acceptsMarketing: sql`${schema.customer.acceptsMarketing} or excluded.accepts_marketing`,
          marketingConsentAt: sql`coalesce(${schema.customer.marketingConsentAt}, excluded.marketing_consent_at)`,
        },
      });
    stats.customers++;
  }

  const uniqueRedirects = [...new Map(redirects.map((r) => [r.fromPath, r])).values()].filter(
    (r) => r.fromPath !== r.toPath,
  );
  if (uniqueRedirects.length > 0) {
    await tx
      .insert(schema.redirect)
      .values(uniqueRedirects.map((r) => ({ organizationId, ...r })))
      .onConflictDoUpdate({
        target: [schema.redirect.organizationId, schema.redirect.fromPath],
        set: { toPath: sql`excluded.to_path` },
      });
    stats.redirects = uniqueRedirects.length;
  }

  return stats;
}

/** Products of the tenant's store that came from a source, for reports and checks. */
export function listImportedProducts(ctx: TenantContext, source: string) {
  return ctx.db
    .select({
      id: schema.product.id,
      slug: schema.product.slug,
      name: schema.product.name,
      price: schema.product.price,
      status: schema.product.status,
      externalId: schema.product.externalId,
    })
    .from(schema.product)
    .where(
      and(
        eq(schema.product.organizationId, ctx.organizationId),
        eq(schema.product.externalSource, source),
      ),
    );
}

/** Variants of some of the tenant's products. */
export async function listVariants(ctx: TenantContext, productIds: string[]) {
  if (productIds.length === 0) return [];
  return ctx.db
    .select({
      productId: schema.productVariant.productId,
      options: schema.productVariant.options,
      price: schema.productVariant.price,
      externalId: schema.productVariant.externalId,
    })
    .from(schema.productVariant)
    .innerJoin(schema.product, eq(schema.product.id, schema.productVariant.productId))
    .where(
      and(
        eq(schema.product.organizationId, ctx.organizationId),
        inArray(schema.productVariant.productId, productIds),
      ),
    );
}
