import { checkHaciendaCredentials } from "@monaztore/hacienda";
import { secrets } from "./services.server";

/** What `saveEinvoicingCredentials` needs: the sealing key and a real check against Hacienda. */
export const einvoicingCredentialDeps = {
  sealKey: secrets.einvoicing,
  verifyLogin: checkHaciendaCredentials,
};

/** A store's XML, downloaded with its clave as the name. */
export function xmlDownload(name: string, xml: string): Response {
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name.replace(/[^\w.-]/g, "")}.xml"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
