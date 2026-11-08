/**
 * A store's photos at the size the page shows them. Our photos (`/media/…`) come in narrower
 * copies (`?w=320`, made once by routes/media.ts and kept), so a phone's grid never downloads the
 * full photo; a photo elsewhere (an old shop's address) is left as it is. Client-safe: the
 * widths are the same as `imageWidths` in @monaztore/storage/images (media.test.ts checks it).
 */
export const photoWidths = [160, 320, 480, 640, 960] as const;
export type PhotoWidth = (typeof photoWidths)[number];

/** How wide our full photos are at most (`webImage`'s default). */
const FULL_WIDTH = 1200;

const isOurs = (url: string) => url.startsWith("/media/");

/** The photo at one width (a thumbnail), or the address as it is when it isn't ours. */
export function photoSrc(url: string, width: PhotoWidth): string {
  return isOurs(url) ? `${url}?w=${width}` : url;
}

/** `srcset` with the narrower copies and the full photo; undefined when it isn't ours. */
export function photoSrcSet(url: string, widths: readonly PhotoWidth[]): string | undefined {
  if (!isOurs(url)) return undefined;
  return [...widths.map((width) => `${url}?w=${width} ${width}w`), `${url} ${FULL_WIDTH}w`].join(
    ", ",
  );
}
