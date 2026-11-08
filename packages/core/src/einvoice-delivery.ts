import { discountedUnits, haciendaEnvironmentOf } from "@monaztore/contracts";
import { and, asc, type Database, eq, inArray, isNull, lt, lte, or, schema } from "@monaztore/db";
import type { EinvoiceProblem, TaxReceiver } from "@monaztore/db/schema";
import {
  buildComprobante,
  CertificateError,
  HaciendaAuthError,
  type HaciendaCredentials,
  type HaciendaGateway,
  HaciendaRefusedError,
  type PaymentCode,
  signComprobante,
} from "@monaztore/hacienda";
import { openSecret } from "./sealed";

/**
 * The worker's side of electronic invoicing: signs the queued documents, sends them to Hacienda,
 * asks how they went and tells the buyer once accepted. No tenant: it runs for every store, like
 * the other jobs, and each document carries its organization.
 */

export interface AcceptedEinvoice {
  organizationId: string;
  orderNumber: number;
  kind: "invoice" | "ticket";
  consecutive: string;
  clave: string;
  /** Where the order goes: the buyer's email and their language. */
  email: string;
  locale: string;
  storeName: string;
  signedXml: string;
  responseXml: string | null;
}

export interface EinvoiceDeliveryDeps {
  /** From `deriveSecret(BETTER_AUTH_SECRET, "einvoicing")`, the same the web seals with. */
  sealKey: string;
  /** A gateway per store's credentials (the real one: `createHaciendaGateway`). */
  gateway: (credentials: HaciendaCredentials) => HaciendaGateway;
  /** Monaztore's ID as the software provider; the store's own without it. */
  providerId?: string;
  /** Emails the documents to the buyer. A failure doesn't undo the acceptance. */
  notify?: (einvoice: AcceptedEinvoice) => Promise<void>;
  now?: () => Date;
  /** How many documents one round takes. */
  batch?: number;
  /** Only these stores' documents (tests, an operator retrying one store). */
  organizationIds?: string[];
}

/** Tries before a document that Hacienda never answered is marked failed. */
export const EINVOICE_MAX_ATTEMPTS = 12;
const LEASE_MS = 2 * 60 * 1000;

/** 10 s, 20 s, 40 s… up to an hour. */
export function retryDelayMs(attempts: number): number {
  return Math.min(10_000 * 2 ** attempts, 60 * 60 * 1000);
}

const paymentCodes: Record<string, PaymentCode> = { sinpe: "06", transfer: "04" };

type Einvoice = typeof schema.einvoice.$inferSelect;
type Settings = typeof schema.storeEinvoicing.$inferSelect;

/** Takes the documents that are due and no other worker holds, for a while. */
async function claim(
  db: Database,
  now: Date,
  batch: number,
  organizationIds?: string[],
): Promise<Einvoice[]> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: schema.einvoice.id })
      .from(schema.einvoice)
      .where(
        and(
          inArray(schema.einvoice.status, ["queued", "sent"]),
          lte(schema.einvoice.nextAttemptAt, now),
          or(isNull(schema.einvoice.leaseUntil), lt(schema.einvoice.leaseUntil, now)),
          organizationIds ? inArray(schema.einvoice.organizationId, organizationIds) : undefined,
        ),
      )
      .orderBy(asc(schema.einvoice.nextAttemptAt))
      .limit(batch)
      .for("update", { skipLocked: true });
    if (due.length === 0) return [];
    return tx
      .update(schema.einvoice)
      .set({ leaseUntil: new Date(now.getTime() + LEASE_MS) })
      .where(
        inArray(
          schema.einvoice.id,
          due.map((row) => row.id),
        ),
      )
      .returning();
  });
}

function credentialsOf(settings: Settings, sealKey: string): HaciendaCredentials {
  if (!settings.haciendaPassword) throw new HaciendaAuthError("No password saved");
  let password: string;
  try {
    password = openSecret(sealKey, settings.haciendaPassword).toString();
  } catch {
    throw new HaciendaAuthError("The password can't be opened: enter it again");
  }
  return {
    environment: haciendaEnvironmentOf(settings.haciendaUsername),
    username: settings.haciendaUsername,
    password,
  };
}

/** Builds the document from the order as it was sold, and signs it with the store's key. */
async function signedDocument(
  db: Database,
  doc: Einvoice,
  settings: Settings,
  deps: EinvoiceDeliveryDeps,
): Promise<string> {
  if (!doc.orderId) throw new InvalidDocument("The order no longer exists");
  const [order] = await db
    .select({ paymentMethod: schema.order.paymentMethod, currency: schema.order.currency })
    .from(schema.order)
    .where(eq(schema.order.id, doc.orderId));
  if (!order) throw new InvalidDocument("The order no longer exists");
  if (order.currency !== "CRC") throw new InvalidDocument("Only orders in colones for now");
  const lines = await db
    .select({
      name: schema.orderLine.name,
      variantTitle: schema.orderLine.variantTitle,
      quantity: schema.orderLine.quantity,
      unitPrice: schema.orderLine.unitPrice,
      lineTotal: schema.orderLine.lineTotal,
      discount: schema.orderLine.discount,
    })
    .from(schema.orderLine)
    .where(eq(schema.orderLine.orderId, doc.orderId))
    .orderBy(asc(schema.orderLine.position));
  const receiver = doc.receiver as TaxReceiver | null;
  let built: ReturnType<typeof buildComprobante>;
  try {
    built = buildComprobante({
      kind: doc.kind,
      issuer: {
        idType: settings.idType ?? "01",
        idNumber: settings.idNumber ?? "",
        name: settings.name,
        commercialName: settings.commercialName || undefined,
        email: settings.email,
        phone: settings.phone || undefined,
        activityCode: settings.activityCode,
        province: settings.province,
        canton: settings.canton,
        district: settings.district,
        address: settings.address,
      },
      receiver: receiver ?? undefined,
      providerId: deps.providerId ?? settings.idNumber ?? "",
      branch: Number(doc.consecutive.slice(0, 3)),
      terminal: Number(doc.consecutive.slice(3, 8)),
      number: doc.number,
      issuedAt: doc.issuedAt,
      securityCode: doc.securityCode,
      currency: "CRC",
      exchangeRate: "1",
      payment: paymentCodes[order.paymentMethod] ?? "99",
      // A coupon's share lowers the line's price, so the document adds up to what was paid.
      lines: lines.flatMap((line) =>
        discountedUnits(line).map((units) => ({
          detail: line.variantTitle ? `${line.name} (${line.variantTitle})` : line.name,
          cabys: settings.cabys,
          quantity: units.quantity,
          unitPriceMinor: units.unitPrice,
        })),
      ),
    });
  } catch (error) {
    throw new InvalidDocument(error instanceof Error ? error.message : String(error));
  }
  if (built.clave !== doc.clave) throw new InvalidDocument("The store's ID changed: issue again");
  if (!settings.certificate || !settings.certificatePin) throw new CertificateError("unreadable");
  let p12: Buffer;
  let pin: string;
  try {
    p12 = Buffer.from(openSecret(deps.sealKey, settings.certificate).toString(), "base64");
    pin = openSecret(deps.sealKey, settings.certificatePin).toString();
  } catch {
    throw new CertificateError("unreadable");
  }
  try {
    return await signComprobante(built.xml, p12, pin);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid v4.4")) {
      throw new InvalidDocument(error.message);
    }
    throw new CertificateError("unreadable");
  }
}

class InvalidDocument extends Error {}

/** A problem that retrying won't fix, with its code for the store. */
function permanentProblem(error: unknown): EinvoiceProblem | undefined {
  if (error instanceof HaciendaAuthError) return "credentials";
  if (error instanceof CertificateError) return "certificate";
  if (error instanceof InvalidDocument || error instanceof HaciendaRefusedError) return "invalid";
  return undefined;
}

async function notifyBuyer(db: Database, doc: Einvoice, deps: EinvoiceDeliveryDeps) {
  if (!deps.notify || !doc.orderId || !doc.signedXml) return;
  const [order] = await db
    .select({ email: schema.order.email, locale: schema.order.locale })
    .from(schema.order)
    .where(eq(schema.order.id, doc.orderId));
  const [store] = await db
    .select({ name: schema.organization.name })
    .from(schema.organization)
    .where(eq(schema.organization.id, doc.organizationId));
  if (!order) return;
  await deps.notify({
    organizationId: doc.organizationId,
    orderNumber: doc.orderNumber,
    kind: doc.kind,
    consecutive: doc.consecutive,
    clave: doc.clave,
    email: doc.receiver?.email || order.email,
    locale: order.locale,
    storeName: store?.name ?? "",
    signedXml: doc.signedXml,
    responseXml: doc.responseXml,
  });
  await db
    .update(schema.einvoice)
    .set({ emailedAt: new Date() })
    .where(eq(schema.einvoice.id, doc.id));
}

async function advance(db: Database, doc: Einvoice, deps: EinvoiceDeliveryDeps, now: Date) {
  const update = (values: Partial<Einvoice>) =>
    db
      .update(schema.einvoice)
      .set({ leaseUntil: null, ...values })
      .where(eq(schema.einvoice.id, doc.id));
  const [settings] = await db
    .select()
    .from(schema.storeEinvoicing)
    .where(eq(schema.storeEinvoicing.organizationId, doc.organizationId));

  try {
    if (!settings) throw new InvalidDocument("The store's invoicing settings are gone");
    const gateway = deps.gateway(credentialsOf(settings, deps.sealKey));

    if (doc.status === "queued") {
      const signedXml = doc.signedXml ?? (await signedDocument(db, doc, settings, deps));
      if (!doc.signedXml) await update({ signedXml, leaseUntil: doc.leaseUntil });
      await gateway.submit({
        clave: doc.clave,
        issuedAt: signedXml.match(/<FechaEmision>([^<]+)<\/FechaEmision>/)?.[1] ?? "",
        issuer: { idType: settings.idType ?? "01", idNumber: settings.idNumber ?? "" },
        receiver: doc.receiver
          ? { idType: doc.receiver.idType, idNumber: doc.receiver.idNumber }
          : undefined,
        signedXml,
      });
      // Hacienda takes a few seconds to check it.
      await update({
        status: "sent",
        sentAt: now,
        attempts: 0,
        nextAttemptAt: new Date(now.getTime() + 5_000),
      });
      return;
    }

    const verdict = await gateway.status(doc.clave);
    if (verdict.state === "pending") {
      await update({
        attempts: doc.attempts + 1,
        nextAttemptAt: new Date(now.getTime() + retryDelayMs(doc.attempts)),
      });
      return;
    }
    if (verdict.state === "rejected") {
      await update({
        status: "rejected",
        problem: "rejected",
        message: verdict.reason ?? null,
        responseXml: verdict.responseXml ?? null,
        decidedAt: now,
      });
      return;
    }
    await update({
      status: "accepted",
      problem: null,
      message: null,
      responseXml: verdict.responseXml ?? null,
      decidedAt: now,
    });
    await notifyBuyer(db, { ...doc, responseXml: verdict.responseXml ?? null }, deps).catch(
      () => undefined,
    );
  } catch (error) {
    const problem = permanentProblem(error);
    const message = error instanceof Error ? error.message.slice(0, 1000) : String(error);
    if (problem) {
      await update({ status: "failed", problem, message });
      return;
    }
    const attempts = doc.attempts + 1;
    // Waiting on Hacienda's verdict never gives up: the document is already there.
    if (doc.status === "queued" && attempts >= EINVOICE_MAX_ATTEMPTS) {
      await update({ status: "failed", problem: "unreachable", message, attempts });
      return;
    }
    await update({
      attempts,
      message,
      nextAttemptAt: new Date(now.getTime() + retryDelayMs(attempts)),
    });
  }
}

/** One round: every due document moves one step. Returns how many it took. */
export async function deliverEinvoices(db: Database, deps: EinvoiceDeliveryDeps): Promise<number> {
  const now = deps.now?.() ?? new Date();
  const claimed = await claim(db, now, deps.batch ?? 20, deps.organizationIds);
  for (const doc of claimed) await advance(db, doc, deps, now);
  return claimed.length;
}
