import { createHash } from "node:crypto";
import {
  DEFAULT_DOWNLOAD_DAYS,
  DEFAULT_DOWNLOAD_LIMIT,
  DIGITAL_FILE_MAX_BYTES,
  downloadFileName,
  PRODUCT_FILES_MAX,
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
  schema,
  sql,
} from "@monaztore/db";
import type { FileStore } from "@monaztore/storage";
import { DomainError } from "./errors";
import { slugify } from "./slug";
import type { TenantContext } from "./tenant";

/**
 * Digital products: a product with files is one the buyer downloads once the order is paid.
 * Its files live under `downloads/<organization>/…`, never under `organizations/…`, so `/media`
 * (public, for photos) can't serve them: only a paid order's download does.
 */

export interface DigitalFileDeps {
  files: FileStore;
}

/** A file as it came in the form. */
export interface FileUpload {
  bytes: Uint8Array;
  fileName: string;
  contentType: string;
}

export interface DigitalProductRow {
  id: string;
  name: string;
  status: string;
  price: number | null;
  files: number;
  downloadLimit: number | null;
  downloadDays: number | null;
}

export interface DigitalProduct extends Omit<DigitalProductRow, "files"> {
  slug: string;
  files: { id: string; fileName: string; size: number }[];
}

const ownerOnly = (ctx: TenantContext) => {
  if (ctx.role !== "owner")
    throw new DomainError("forbidden", "Only owners manage digital products");
};

/** A content type safe to put in a header, or a plain binary file. */
export function safeContentType(type: string): string {
  const clean = type.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/.test(clean)
    ? clean
    : "application/octet-stream";
}

/** The key a file goes under: the store's downloads folder, named after its contents. */
export function downloadKey(organizationId: string, bytes: Uint8Array, fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const extension = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : "";
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
  return `downloads/${organizationId}/${hash}.${/^[a-z0-9]{1,10}$/.test(extension) ? extension : "bin"}`;
}

async function storeFile(ctx: TenantContext, deps: DigitalFileDeps, upload: FileUpload) {
  if (upload.bytes.byteLength === 0) throw new DomainError("file_empty", "The file is empty");
  if (upload.bytes.byteLength > DIGITAL_FILE_MAX_BYTES) {
    throw new DomainError("file_too_big", "The file is over the limit");
  }
  const fileName = downloadFileName(upload.fileName);
  const contentType = safeContentType(upload.contentType);
  const key = downloadKey(ctx.organizationId, upload.bytes, fileName);
  await deps.files.put(key, upload.bytes, contentType);
  return { key, fileName, contentType, size: upload.bytes.byteLength };
}

/** The store's currency (ISO 4217), for the prices its forms show and read. */
export async function storeCurrency(ctx: TenantContext): Promise<string> {
  const [settings] = await ctx.db
    .select({ currency: schema.storeSettings.currency })
    .from(schema.storeSettings)
    .where(eq(schema.storeSettings.organizationId, ctx.organizationId));
  return settings?.currency ?? "CRC";
}

/** The store's name and main domain, for what it sends shoppers (the downloads email). */
export async function storeIdentity(
  ctx: TenantContext,
): Promise<{ name: string; hostname: string | null }> {
  const [found] = await ctx.db
    .select({ name: schema.organization.name })
    .from(schema.organization)
    .where(eq(schema.organization.id, ctx.organizationId));
  const [domain] = await ctx.db
    .select({ hostname: schema.storeDomain.hostname })
    .from(schema.storeDomain)
    .where(eq(schema.storeDomain.organizationId, ctx.organizationId))
    .orderBy(desc(schema.storeDomain.primary), asc(schema.storeDomain.hostname))
    .limit(1);
  return { name: found?.name ?? "", hostname: domain?.hostname ?? null };
}

/** The store's digital products (those with files), newest first. */
export async function listDigitalProducts(ctx: TenantContext): Promise<DigitalProductRow[]> {
  return ctx.db
    .select({
      id: schema.product.id,
      name: schema.product.name,
      status: schema.product.status,
      price: schema.product.price,
      files: count(schema.productFile.id),
      downloadLimit: schema.product.downloadLimit,
      downloadDays: schema.product.downloadDays,
    })
    .from(schema.product)
    .innerJoin(schema.productFile, eq(schema.productFile.productId, schema.product.id))
    .where(eq(schema.product.organizationId, ctx.organizationId))
    .groupBy(schema.product.id)
    .orderBy(desc(schema.product.createdAt));
}

/** Products that don't deliver a file yet, by name, to add one to. At most 20. */
export async function findProductsWithoutFiles(
  ctx: TenantContext,
  query: string,
): Promise<{ id: string; name: string; status: string }[]> {
  const q = query.trim().slice(0, 100);
  if (!q) return [];
  return ctx.db
    .select({ id: schema.product.id, name: schema.product.name, status: schema.product.status })
    .from(schema.product)
    .where(
      and(
        eq(schema.product.organizationId, ctx.organizationId),
        ilike(schema.product.name, `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`),
        sql`not exists (select 1 from ${schema.productFile} where ${schema.productFile.productId} = ${schema.product.id})`,
      ),
    )
    .orderBy(asc(schema.product.name))
    .limit(20);
}

/** One product of the store with its files; undefined for another store's. */
export async function getDigitalProduct(
  ctx: TenantContext,
  productId: string,
): Promise<DigitalProduct | undefined> {
  const [product] = await ctx.db
    .select({
      id: schema.product.id,
      slug: schema.product.slug,
      name: schema.product.name,
      status: schema.product.status,
      price: schema.product.price,
      downloadLimit: schema.product.downloadLimit,
      downloadDays: schema.product.downloadDays,
    })
    .from(schema.product)
    .where(
      and(eq(schema.product.organizationId, ctx.organizationId), eq(schema.product.id, productId)),
    );
  if (!product) return undefined;
  const files = await ctx.db
    .select({
      id: schema.productFile.id,
      fileName: schema.productFile.fileName,
      size: schema.productFile.size,
    })
    .from(schema.productFile)
    .where(eq(schema.productFile.productId, product.id))
    .orderBy(asc(schema.productFile.position), asc(schema.productFile.createdAt));
  return { ...product, files };
}

async function ownProduct(db: Database, organizationId: string, productId: string) {
  const [found] = await db
    .select({ id: schema.product.id })
    .from(schema.product)
    .where(and(eq(schema.product.organizationId, organizationId), eq(schema.product.id, productId)))
    .for("update");
  if (!found) throw new DomainError("not_found", "No such product");
  return found;
}

/** Adds a file the product delivers. A product with its first file becomes digital. */
export async function addProductFile(
  ctx: TenantContext,
  deps: DigitalFileDeps,
  productId: string,
  upload: FileUpload,
): Promise<void> {
  ownerOnly(ctx);
  await ctx.db.transaction(async (tx) => {
    await ownProduct(tx as unknown as Database, ctx.organizationId, productId);
    const [files] = await tx
      .select({
        total: count(),
        last: sql<number>`coalesce(max(${schema.productFile.position}), -1)`,
      })
      .from(schema.productFile)
      .where(eq(schema.productFile.productId, productId));
    if ((files?.total ?? 0) >= PRODUCT_FILES_MAX) {
      throw new DomainError("too_many_files", "The product has as many files as it can");
    }
    const stored = await storeFile(ctx, deps, upload);
    await tx.insert(schema.productFile).values({
      organizationId: ctx.organizationId,
      productId,
      ...stored,
      position: Number(files?.last ?? -1) + 1,
    });
  });
}

/**
 * Stops delivering a file to new orders. Orders already placed keep their copy (and the file
 * stays in the store's files for them).
 */
export async function removeProductFile(
  ctx: TenantContext,
  productId: string,
  fileId: string,
): Promise<void> {
  ownerOnly(ctx);
  const removed = await ctx.db
    .delete(schema.productFile)
    .where(
      and(
        eq(schema.productFile.organizationId, ctx.organizationId),
        eq(schema.productFile.productId, productId),
        eq(schema.productFile.id, fileId),
      ),
    )
    .returning({ id: schema.productFile.id });
  if (removed.length === 0) throw new DomainError("not_found", "No such file");
}

/** How many times and for how long each file of the product can be downloaded (null = no limit). */
export async function setDownloadRules(
  ctx: TenantContext,
  productId: string,
  rules: { downloadLimit: number | null; downloadDays: number | null },
): Promise<void> {
  ownerOnly(ctx);
  const updated = await ctx.db
    .update(schema.product)
    .set(rules)
    .where(
      and(eq(schema.product.organizationId, ctx.organizationId), eq(schema.product.id, productId)),
    )
    .returning({ id: schema.product.id });
  if (updated.length === 0) throw new DomainError("not_found", "No such product");
}

/** A slug of the store no product has yet: `guide`, then `guide-2`… */
async function freeProductSlug(db: Database, organizationId: string, name: string) {
  const base = slugify(name) || "product";
  const taken = await db
    .select({ slug: schema.product.slug })
    .from(schema.product)
    .where(
      and(
        eq(schema.product.organizationId, organizationId),
        sql`(${schema.product.slug} = ${base} or ${schema.product.slug} like ${`${base}-%`})`,
      ),
    );
  const used = new Set(taken.map((row) => row.slug));
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

/**
 * "New digital product": on sale right away, with its file, its download rules and, if it came,
 * its photo (a `/media/…` address of `saveStoreImage`). Returns its id.
 */
export async function createDigitalProduct(
  ctx: TenantContext,
  deps: DigitalFileDeps,
  input: {
    name: string;
    price: number;
    description: string;
    downloadLimit?: number | null;
    downloadDays?: number | null;
    file: FileUpload;
    imageUrl?: string | null;
  },
): Promise<string> {
  ownerOnly(ctx);
  if (!Number.isSafeInteger(input.price) || input.price <= 0) {
    throw new DomainError("price_invalid", "A digital product needs a price");
  }
  const stored = await storeFile(ctx, deps, input.file);
  return ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Database;
    const description = input.description
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
      .join("");
    const [product] = await tx
      .insert(schema.product)
      .values({
        organizationId: ctx.organizationId,
        slug: await freeProductSlug(db, ctx.organizationId, input.name),
        name: input.name,
        description,
        status: "active",
        price: input.price,
        stockQuantity: null,
        inStock: true,
        downloadLimit:
          input.downloadLimit === undefined ? DEFAULT_DOWNLOAD_LIMIT : input.downloadLimit,
        downloadDays: input.downloadDays === undefined ? DEFAULT_DOWNLOAD_DAYS : input.downloadDays,
      })
      .returning({ id: schema.product.id });
    if (!product) throw new Error("Product not created");
    await tx
      .insert(schema.productFile)
      .values({ organizationId: ctx.organizationId, productId: product.id, ...stored });
    if (input.imageUrl) {
      await tx
        .insert(schema.productImage)
        .values({ productId: product.id, url: input.imageUrl, alt: input.name });
    }
    return product.id;
  });
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot", "'": "#39" }[c]};`,
  );

/** Which of these products deliver files. */
export async function digitalProductIds(
  db: Database,
  organizationId: string,
  productIds: readonly string[],
): Promise<Set<string>> {
  if (productIds.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ productId: schema.productFile.productId })
    .from(schema.productFile)
    .where(
      and(
        eq(schema.productFile.organizationId, organizationId),
        inArray(schema.productFile.productId, [...productIds]),
      ),
    );
  return new Set(rows.map((row) => row.productId));
}
