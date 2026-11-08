import { mediaKeyOf } from "@monaztore/core";
import { imageWidths, narrowerImage } from "@monaztore/storage/images";
import { data } from "react-router";
import { files } from "~/lib/services.server";
import type { Route } from "./+types/media";

const contentTypes: Record<string, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
  png: "image/png",
  avif: "image/avif",
};

const headers = (contentType: string, length: number) => ({
  "Content-Type": contentType,
  "Content-Length": String(length),
  "Cache-Control": "public, max-age=31536000, immutable",
  "X-Content-Type-Options": "nosniff",
});

/**
 * Serves a store's file. Keys are named after their contents, so a key's bytes never change and
 * browsers and CDNs may keep them forever. Only image types, sent with `nosniff`. `?w=320` asks
 * for a narrower copy of a photo (one of `imageWidths`): made the first time and kept with the
 * store's files under `variants/`, so it is encoded once.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const key = mediaKeyOf(`/media/${params["*"] ?? ""}`);
  const contentType = key && contentTypes[key.slice(key.lastIndexOf(".") + 1)];
  if (!key || !contentType) throw data("Not found", { status: 404 });

  const width = Number(new URL(request.url).searchParams.get("w"));
  if (imageWidths.includes(width as (typeof imageWidths)[number])) {
    const variantKey = `variants/w${width}/${key.replace(/\.[a-z]+$/, "")}.webp`;
    const kept = await files.get(variantKey);
    if (kept)
      return new Response(new Uint8Array(kept), {
        headers: headers("image/webp", kept.byteLength),
      });
    const original = await files.get(key);
    if (!original) throw data("Not found", { status: 404 });
    try {
      const image = await narrowerImage(new Uint8Array(original), width);
      await files.put(variantKey, image.body, image.contentType);
      return new Response(new Uint8Array(image.body), {
        headers: headers(image.contentType, image.body.byteLength),
      });
    } catch {
      // Not something sharp reads: the original, as it is.
      return new Response(new Uint8Array(original), {
        headers: headers(contentType, original.byteLength),
      });
    }
  }

  const body = await files.get(key);
  if (!body) throw data("Not found", { status: 404 });
  return new Response(new Uint8Array(body), { headers: headers(contentType, body.byteLength) });
}
