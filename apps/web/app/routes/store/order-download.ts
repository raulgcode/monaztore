import { openOrderDownload } from "@monaztore/core";
import { href } from "react-router";
import { downloadResponse } from "~/lib/downloads.server";
import { requireStore } from "~/middleware/store.server";
import type { Route } from "./+types/order-download";

/**
 * A digital product's file from the order's page: the order's secret link is the key, the same
 * as its page, and it only opens once paid, within its days and downloads.
 */
export async function loader({ params, context }: Route.LoaderArgs) {
  const result = await openOrderDownload(requireStore(context), params.token, params.id);
  return downloadResponse(result, `${href("/orders/:token", { token: params.token })}#downloads`);
}
