import type { ImportedCatalog } from "@monaztore/contracts";
import { assertKey, contentKey, type FileStore } from "@monaztore/storage";
import { DomainError } from "./errors";
import type { TenantContext } from "./tenant";

/** Where the web app serves a store's files: `/media/<key>`, on any of its hosts. */
const MEDIA_PREFIX = "/media/";

export function mediaPath(key: string): string {
  return `${MEDIA_PREFIX}${key}`;
}

/**
 * The file key behind a `/media/…` address, or null when it isn't one of a store's files
 * (`organizations/<id>/…`), so the media route never reads anything else.
 */
export function mediaKeyOf(path: string): string | null {
  if (!path.startsWith(MEDIA_PREFIX)) return null;
  const key = path.slice(MEDIA_PREFIX.length);
  if (!key.startsWith("organizations/")) return null;
  try {
    assertKey(key);
  } catch {
    return null;
  }
  return key;
}

export interface ConvertedImage {
  body: Uint8Array;
  contentType: string;
  extension: string;
}

export interface ImageCopyDeps {
  files: Pick<FileStore, "put">;
  /** The bytes of an image on the old site (`downloadImage` of `@monaztore/storage/images`). */
  download: (url: string) => Promise<Uint8Array>;
  /** The file we keep (`webImage`): re-encoded, so nothing of the original comes along. */
  convert: (bytes: Uint8Array) => Promise<ConvertedImage>;
  /** Downloads at a time; 6 by default, gentle with the old site. */
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}

export interface ImageCopyResult {
  catalog: ImportedCatalog;
  /** Files copied in this run. */
  copied: number;
  failed: number;
}

/**
 * Copies every photo of a catalog (products, variants and categories) to the store's own files
 * and returns the catalog pointing at those copies, so the store never depends on the old site.
 * Each address is downloaded once; one that fails keeps its old address and goes to the
 * warnings. Addresses that are already ours are left as they are, so it can run again.
 */
export async function copyCatalogImages(
  ctx: TenantContext,
  catalog: ImportedCatalog,
  { files, download, convert, concurrency = 6, onProgress }: ImageCopyDeps,
): Promise<ImageCopyResult> {
  if (ctx.role !== "owner") throw new DomainError("forbidden", "Only owners import catalogs");

  const urls = new Set<string>();
  const add = (url: string | null) => {
    if (url && !mediaKeyOf(url)) urls.add(url);
  };
  for (const category of catalog.categories) add(category.imageUrl);
  for (const product of catalog.products) {
    for (const image of product.images) add(image.url);
    for (const variant of product.variants) add(variant.imageUrl);
  }

  const prefix = `organizations/${ctx.organizationId}/images`;
  const copies = new Map<string, string>();
  const warnings: string[] = [];
  const queue = [...urls];
  let done = 0;
  const worker = async () => {
    for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
      try {
        const image = await convert(await download(url));
        const key = contentKey(prefix, image.body, image.extension);
        await files.put(key, image.body, image.contentType);
        copies.set(url, mediaPath(key));
      } catch (error) {
        warnings.push(`Couldn't copy ${url}: ${(error as Error).message}`);
      }
      onProgress?.(++done, urls.size);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  const ours = (url: string) => copies.get(url) ?? url;
  return {
    catalog: {
      ...catalog,
      categories: catalog.categories.map((category) => ({
        ...category,
        imageUrl: category.imageUrl && ours(category.imageUrl),
      })),
      products: catalog.products.map((product) => ({
        ...product,
        images: product.images.map((image) => ({ ...image, url: ours(image.url) })),
        variants: product.variants.map((variant) => ({
          ...variant,
          imageUrl: variant.imageUrl && ours(variant.imageUrl),
        })),
      })),
      warnings: [...catalog.warnings, ...warnings.toSorted()],
    },
    copied: copies.size,
    failed: urls.size - copies.size,
  };
}
