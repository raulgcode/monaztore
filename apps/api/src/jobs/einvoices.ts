import { type AcceptedEinvoice, deliverEinvoices } from "@monaztore/core";
import type { Database } from "@monaztore/db";
import { einvoiceMessage, type Mailer } from "@monaztore/email";
import {
  createHaciendaGateway,
  type HaciendaCredentials,
  type HaciendaGateway,
} from "@monaztore/hacienda";
import { defaultLocale, parseLocale } from "@monaztore/i18n";
import type { FastifyBaseLogger } from "fastify";

interface EinvoiceJobDeps {
  db: Database;
  log: FastifyBaseLogger;
  mailer: Mailer;
  /** `deriveSecret(BETTER_AUTH_SECRET, "einvoicing")`, the key the web sealed the credentials with. */
  sealKey: string;
  providerId?: string;
}

/** One gateway per Hacienda user, so its token is reused between rounds. */
export function gatewayCache(create = createHaciendaGateway) {
  const gateways = new Map<string, { password: string; gateway: HaciendaGateway }>();
  return (credentials: HaciendaCredentials) => {
    const key = `${credentials.environment}:${credentials.username}`;
    const cached = gateways.get(key);
    if (cached && cached.password === credentials.password) return cached.gateway;
    const gateway = create(credentials);
    gateways.set(key, { password: credentials.password, gateway });
    return gateway;
  };
}

/** The buyer's email: the document's XML and Hacienda's answer attached, in their language. */
export function einvoiceNotifier(mailer: Mailer) {
  return async (einvoice: AcceptedEinvoice) => {
    const locale = parseLocale(einvoice.locale) ?? defaultLocale;
    const message = einvoiceMessage({
      locale,
      kind: einvoice.kind,
      storeName: einvoice.storeName,
      orderNumber: einvoice.orderNumber,
      consecutive: einvoice.consecutive,
      clave: einvoice.clave,
    });
    await mailer.send({
      to: einvoice.email,
      ...message,
      attachments: [
        {
          filename: `${einvoice.clave}.xml`,
          content: einvoice.signedXml,
          contentType: "application/xml",
        },
        ...(einvoice.responseXml
          ? [
              {
                filename: `${einvoice.clave}-respuesta.xml`,
                content: einvoice.responseXml,
                contentType: "application/xml",
              },
            ]
          : []),
      ],
    });
  };
}

/**
 * Every 15 seconds: signs the queued electronic documents, sends them to Hacienda and asks for
 * the answer of the ones it has. Rounds never overlap; each document is leased, so a second
 * machine would take other ones.
 */
export function scheduleEinvoiceDelivery(deps: EinvoiceJobDeps, everyMs = 15_000) {
  const gateway = gatewayCache();
  const notify = einvoiceNotifier(deps.mailer);
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await deliverEinvoices(deps.db, {
        sealKey: deps.sealKey,
        gateway,
        providerId: deps.providerId,
        notify,
      });
    } catch (error) {
      deps.log.error({ err: error }, "Electronic invoice delivery failed");
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(run, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
