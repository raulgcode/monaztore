import { openLinkDownload } from "@monaztore/core";
import { href } from "react-router";
import { downloadResponse } from "~/lib/downloads.server";
import { requireStore } from "~/middleware/store.server";
import type { Route } from "./+types/link-download";

/** A digital product's file from the downloads email's link, with the same rules as the order's. */
export async function loader({ params, context }: Route.LoaderArgs) {
  const result = await openLinkDownload(requireStore(context), params.token, params.id);
  return downloadResponse(result, href("/downloads/:token", { token: params.token }));
}
