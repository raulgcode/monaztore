import { getShopperEinvoiceFile } from "@monaztore/core";
import { data } from "react-router";
import { xmlDownload } from "~/lib/einvoicing.server";
import { requireStore } from "~/middleware/store.server";
import type { Route } from "./+types/order-file";

const files = { "document.xml": "document", "response.xml": "response" } as const;

/**
 * The accepted electronic invoice of an order, for its shopper: the order's secret link is the
 * key, the same as its page.
 */
export async function loader({ params, context }: Route.LoaderArgs) {
  const file = files[params.file as keyof typeof files];
  if (!file) throw data("Not found", { status: 404 });
  const found = await getShopperEinvoiceFile(requireStore(context), params.token, file);
  if (!found) throw data("Not found", { status: 404 });
  return xmlDownload(file === "document" ? found.clave : `${found.clave}-respuesta`, found.xml);
}
