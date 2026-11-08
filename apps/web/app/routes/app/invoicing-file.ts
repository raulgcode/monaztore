import { getEinvoiceFile } from "@monaztore/core";
import { data } from "react-router";
import { tenantContext } from "~/context";
import { xmlDownload } from "~/lib/einvoicing.server";
import type { Route } from "./+types/invoicing-file";

const files = { "document.xml": "document", "response.xml": "response" } as const;

/** The signed XML of a workspace's document, or Hacienda's answer to it. */
export async function loader({ params, context }: Route.LoaderArgs) {
  const file = files[params.file as keyof typeof files];
  if (!file) throw data("Not found", { status: 404 });
  const found = await getEinvoiceFile(context.get(tenantContext), params.id, file);
  if (!found) throw data("Not found", { status: 404 });
  return xmlDownload(file === "document" ? found.clave : `${found.clave}-respuesta`, found.xml);
}
