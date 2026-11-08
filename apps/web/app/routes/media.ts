import { mediaKeyOf } from "@monaztore/core";
import { data } from "react-router";
import { files } from "~/lib/services.server";
import type { Route } from "./+types/media";

const contentTypes: Record<string, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
  png: "image/png",
  avif: "image/avif",
};

/**
 * Serves a store's file. Keys are named after their contents, so a key's bytes never change and
 * browsers and CDNs may keep them forever. Only image types, sent with `nosniff`.
 */
export async function loader({ params }: Route.LoaderArgs) {
  const key = mediaKeyOf(`/media/${params["*"] ?? ""}`);
  const contentType = key && contentTypes[key.slice(key.lastIndexOf(".") + 1)];
  if (!key || !contentType) throw data("Not found", { status: 404 });
  const body = await files.get(key);
  if (!body) throw data("Not found", { status: 404 });
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
