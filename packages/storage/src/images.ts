import sharp from "sharp";

/** The formats a product photo may come in. SVG is left out: it can carry scripts. */
const acceptedFormats = new Set(["jpeg", "png", "webp", "gif", "avif", "tiff", "heif"]);

export interface WebImage {
  body: Uint8Array;
  contentType: "image/webp";
  extension: "webp";
  width: number;
  height: number;
}

/**
 * A photo, ready for a storefront: turned upright, no bigger than `maxSize` on its longest side
 * and re-encoded as WebP, our own file that never carries what came inside the original (its
 * metadata, a second image, a script). Throws when the bytes aren't a photo.
 */
export async function webImage(
  input: Uint8Array,
  { maxSize = 1200, quality = 80 }: { maxSize?: number; quality?: number } = {},
): Promise<WebImage> {
  let format: string | undefined;
  try {
    format = (await sharp(input).metadata()).format;
  } catch {
    throw new Error("Not an image");
  }
  if (!format || !acceptedFormats.has(format))
    throw new Error(`Unsupported image format: ${format}`);
  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true })
    .webp({ quality })
    .toBuffer({ resolveWithObject: true });
  return {
    body: new Uint8Array(data),
    contentType: "image/webp",
    extension: "webp",
    width: info.width,
    height: info.height,
  };
}

/**
 * The widths a page may ask a store's photo in (`/media/…?w=320`), so a phone's grid never
 * downloads the full photo: thumbnails, two-per-row cards, the gallery. A short fixed list, so
 * nobody can make the server encode a photo at every width.
 */
export const imageWidths = [160, 320, 480, 640, 960] as const;
export type ImageWidth = (typeof imageWidths)[number];

/** A photo already ours (WebP) at a narrower width, for `srcset`. Never wider than it was. */
export async function narrowerImage(
  input: Uint8Array,
  width: number,
  { quality = 75 }: { quality?: number } = {},
): Promise<WebImage> {
  if (!imageWidths.includes(width as ImageWidth)) throw new Error(`Unsupported width: ${width}`);
  const { data, info } = await sharp(input)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality })
    .toBuffer({ resolveWithObject: true });
  return {
    body: new Uint8Array(data),
    contentType: "image/webp",
    extension: "webp",
    width: info.width,
    height: info.height,
  };
}

export interface DownloadOptions {
  fetch?: typeof globalThis.fetch;
  /** The largest file accepted. 20 MB by default. */
  maxBytes?: number;
  timeoutMs?: number;
}

/**
 * The bytes of an image on another site, over HTTP(S) only and up to `maxBytes`. For operator
 * tools (a migration), never with an address a shopper typed.
 */
export async function downloadImage(
  url: string,
  {
    fetch = globalThis.fetch,
    maxBytes = 20 * 1024 * 1024,
    timeoutMs = 30_000,
  }: DownloadOptions = {},
): Promise<Uint8Array> {
  const { protocol } = new URL(url);
  if (protocol !== "https:" && protocol !== "http:") throw new Error(`Not a web address: ${url}`);
  const response = await fetch(url, {
    headers: { accept: "image/*", "user-agent": "Monaztore-Importer/1.0" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new Error(`Bigger than ${maxBytes} bytes: ${url}`);
  if (!response.body) throw new Error(`Empty answer for ${url}`);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > maxBytes) throw new Error(`Bigger than ${maxBytes} bytes: ${url}`);
    chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks));
}
