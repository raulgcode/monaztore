import { randomInt } from "node:crypto";
import {
  type EinvoicingCredentialsInput,
  type EinvoicingIssuerInput,
  type EinvoicingOptionsInput,
  type EinvoicingProductInput,
  haciendaEnvironmentOf,
  taxIdTypeOf,
} from "@monaztore/contracts";
import { and, count, desc, eq, inArray, ne, schema, sql } from "@monaztore/db";
import type {
  EinvoiceKind,
  EinvoiceProblem,
  EinvoiceStatus,
  OrderTaxId,
  TaxReceiver,
} from "@monaztore/db/schema";
import {
  CertificateError,
  comprobanteKeys,
  type HaciendaCredentials,
  readCertificate,
} from "@monaztore/hacienda";
import { isDistrict } from "@monaztore/hacienda/locations";
import { DomainError } from "./errors";
import { openSecret, sealSecret } from "./sealed";
import type { TenantContext } from "./tenant";

/**
 * Electronic invoicing with Costa Rica's Hacienda, for the workspace: the store's details as a
 * taxpayer, its key, turning it on, and the documents of its orders. Sending them is
 * `deliverEinvoices` (einvoice-delivery.ts), in the API's worker.
 */

type Executor = TenantContext["db"];
type Transaction = Parameters<Parameters<Executor["transaction"]>[0]>[0];

export const EINVOICES_PAGE_SIZE = 25;

/** Only stores in Costa Rica issue Hacienda's documents. */
export const EINVOICING_COUNTRY = "CR";

export interface EinvoicingSettings {
  /** The store is in Costa Rica: the section exists for it. */
  available: boolean;
  enabled: boolean;
  autoIssue: boolean;
  issuer: {
    idNumber: string;
    name: string;
    commercialName: string;
    email: string;
    phone: string;
    activityCode: string;
    /** `1-02-03`, or "" while unset. */
    district: string;
    address: string;
  };
  product: { cabys: string; cabysDescription: string };
  credentials: {
    haciendaUsername: string;
    environment: "sandbox" | "production";
    hasPassword: boolean;
    hasCertificate: boolean;
    certificateSubject: string | null;
    certificateExpiresAt: Date | null;
  };
  branch: number;
  terminal: number;
  /** Which of the three steps are done, so the page shows what is left. */
  steps: { issuer: boolean; product: boolean; credentials: boolean };
}

async function storeCountry(db: Executor, organizationId: string): Promise<string> {
  const [settings] = await db
    .select({ country: schema.storeSettings.country })
    .from(schema.storeSettings)
    .where(eq(schema.storeSettings.organizationId, organizationId));
  // A store without settings yet gets the defaults, and the default is Costa Rica.
  return settings?.country ?? EINVOICING_COUNTRY;
}

async function settingsRow(db: Executor, organizationId: string) {
  const [row] = await db
    .select()
    .from(schema.storeEinvoicing)
    .where(eq(schema.storeEinvoicing.organizationId, organizationId));
  return row;
}

type SettingsRow = typeof schema.storeEinvoicing.$inferSelect;

function stepsOf(row: SettingsRow | undefined) {
  return {
    issuer: Boolean(row?.idNumber && row.name && row.activityCode && row.district && row.email),
    product: Boolean(row?.cabys),
    credentials: Boolean(
      row?.haciendaUsername && row.haciendaPassword && row.certificate && row.certificatePin,
    ),
  };
}

/** The store's invoicing as the workspace shows it: never a secret, only whether it is there. */
export async function getEinvoicing(ctx: TenantContext): Promise<EinvoicingSettings> {
  const [country, row] = await Promise.all([
    storeCountry(ctx.db, ctx.organizationId),
    settingsRow(ctx.db, ctx.organizationId),
  ]);
  return {
    available: country === EINVOICING_COUNTRY,
    enabled: row?.enabled ?? false,
    autoIssue: row?.autoIssue ?? true,
    issuer: {
      idNumber: row?.idNumber ?? "",
      name: row?.name ?? "",
      commercialName: row?.commercialName ?? "",
      email: row?.email ?? "",
      phone: row?.phone ?? "",
      activityCode: row?.activityCode ?? "",
      district: row?.district ? `${row.province}-${row.canton}-${row.district}` : "",
      address: row?.address ?? "",
    },
    product: { cabys: row?.cabys ?? "", cabysDescription: row?.cabysDescription ?? "" },
    credentials: {
      haciendaUsername: row?.haciendaUsername ?? "",
      environment: haciendaEnvironmentOf(row?.haciendaUsername ?? ""),
      hasPassword: Boolean(row?.haciendaPassword),
      hasCertificate: Boolean(row?.certificate),
      certificateSubject: row?.certificateSubject ?? null,
      certificateExpiresAt: row?.certificateExpiresAt ?? null,
    },
    branch: row?.branch ?? 1,
    terminal: row?.terminal ?? 1,
    steps: stepsOf(row),
  };
}

async function requireAvailable(ctx: TenantContext) {
  if ((await storeCountry(ctx.db, ctx.organizationId)) !== EINVOICING_COUNTRY) {
    throw new DomainError("einvoicing_unavailable", "Electronic invoicing is for Costa Rica only");
  }
}

async function upsertSettings(
  ctx: TenantContext,
  values: Partial<typeof schema.storeEinvoicing.$inferInsert>,
) {
  await ctx.db
    .insert(schema.storeEinvoicing)
    .values({ organizationId: ctx.organizationId, ...values })
    .onConflictDoUpdate({ target: schema.storeEinvoicing.organizationId, set: values });
}

/** Step 1: who issues. The district must exist in Hacienda's list. */
export async function saveEinvoicingIssuer(ctx: TenantContext, input: EinvoicingIssuerInput) {
  await requireAvailable(ctx);
  const idType = taxIdTypeOf(input.idNumber);
  const [province = "", canton = "", district = ""] = input.district.split("-");
  if (!idType) throw new DomainError("tax_id_invalid", "Not a Costa Rican ID");
  if (!isDistrict(province, canton, district)) {
    throw new DomainError("district_invalid", "No such district");
  }
  await upsertSettings(ctx, {
    idType,
    idNumber: input.idNumber,
    name: input.name,
    commercialName: input.commercialName,
    email: input.email,
    phone: input.phone,
    activityCode: input.activityCode,
    province,
    canton,
    district,
    address: input.address,
  });
}

/** Step 2: the CABYS code every line carries. */
export async function saveEinvoicingProduct(ctx: TenantContext, input: EinvoicingProductInput) {
  await requireAvailable(ctx);
  await upsertSettings(ctx, { cabys: input.cabys, cabysDescription: input.cabysDescription });
}

export interface CredentialsDeps {
  /** From `deriveSecret(BETTER_AUTH_SECRET, "einvoicing")`. */
  sealKey: string;
  /** Asks Hacienda whether the user and password work (`checkHaciendaCredentials`). */
  verifyLogin: (credentials: HaciendaCredentials) => Promise<boolean>;
  now?: Date;
}

/**
 * Step 3: the ATV user and password, and the key with its PIN. What is left empty keeps what was
 * saved. Everything is checked before it is kept: the PIN opens the key and Hacienda takes the
 * user. Errors are `DomainError`s whose code names the field to fix.
 */
export async function saveEinvoicingCredentials(
  ctx: TenantContext,
  input: Omit<EinvoicingCredentialsInput, "certificate"> & { certificate?: Buffer },
  deps: CredentialsDeps,
) {
  await requireAvailable(ctx);
  const row = await settingsRow(ctx.db, ctx.organizationId);
  const open = (sealed: string | null | undefined) => {
    if (!sealed) return undefined;
    try {
      return openSecret(deps.sealKey, sealed);
    } catch {
      return undefined;
    }
  };
  const password = input.haciendaPassword || open(row?.haciendaPassword)?.toString();
  if (!password) throw new DomainError("password_required", "The ATV password is missing");
  const saved = open(row?.certificate);
  const certificate = input.certificate?.length
    ? input.certificate
    : saved && Buffer.from(saved.toString(), "base64");
  if (!certificate) throw new DomainError("certificate_required", "The .p12 is missing");
  const pin = input.certificatePin || open(row?.certificatePin)?.toString();
  if (!pin) throw new DomainError("pin_required", "The PIN is missing");

  let info: Awaited<ReturnType<typeof readCertificate>>;
  try {
    info = await readCertificate(certificate, pin, deps.now);
  } catch (error) {
    if (error instanceof CertificateError) {
      throw new DomainError(`certificate_${error.reason}`, error.message);
    }
    throw error;
  }
  const credentials = {
    environment: haciendaEnvironmentOf(input.haciendaUsername),
    username: input.haciendaUsername,
    password,
  };
  if (!(await deps.verifyLogin(credentials))) {
    throw new DomainError("credentials_wrong", "Hacienda didn't take the user and password");
  }
  await upsertSettings(ctx, {
    haciendaUsername: input.haciendaUsername,
    haciendaPassword: sealSecret(deps.sealKey, password),
    certificate: sealSecret(deps.sealKey, certificate.toString("base64")),
    certificatePin: sealSecret(deps.sealKey, pin),
    certificateSubject: info.subject,
    certificateExpiresAt: info.expiresAt,
  });
}

/** Turns invoicing on (only with the three steps done) or off. */
export async function setEinvoicingEnabled(ctx: TenantContext, enabled: boolean) {
  await requireAvailable(ctx);
  if (enabled) {
    const steps = stepsOf(await settingsRow(ctx.db, ctx.organizationId));
    if (!steps.issuer || !steps.product || !steps.credentials) {
      throw new DomainError("einvoicing_incomplete", "Finish the three steps first");
    }
  }
  await upsertSettings(ctx, { enabled });
}

/** Issue on payment or only by hand, and the branch and terminal of the numbers. */
export async function saveEinvoicingOptions(ctx: TenantContext, input: EinvoicingOptionsInput) {
  await requireAvailable(ctx);
  await upsertSettings(ctx, {
    autoIssue: input.autoIssue,
    branch: input.branch,
    terminal: input.terminal,
  });
}

/** Whether the storefront offers "invoice in my name": the store issues documents. */
export async function storeIssuesInvoices(db: Executor, organizationId: string) {
  const [country, row] = await Promise.all([
    storeCountry(db, organizationId),
    settingsRow(db, organizationId),
  ]);
  return country === EINVOICING_COUNTRY && Boolean(row?.enabled);
}

function receiverOf(taxId: OrderTaxId | null, email: string): TaxReceiver | null {
  return taxId ? { ...taxId, email } : null;
}

/**
 * Queues the document of a paid order inside the caller's transaction: takes the next number of
 * its kind under the settings row's lock and fixes the clave's date. An invoice when there is a
 * receiver with an ID, a ticket otherwise. Undefined when the store doesn't issue (off, or not in
 * Costa Rica) or `onlyAuto` and the store issues by hand.
 */
export async function queueOrderEinvoice(
  tx: Transaction | Executor,
  {
    organizationId,
    orderId,
    receiver,
    onlyAuto = false,
    now = new Date(),
  }: {
    organizationId: string;
    orderId: string;
    receiver?: TaxReceiver | null;
    onlyAuto?: boolean;
    now?: Date;
  },
) {
  if ((await storeCountry(tx, organizationId)) !== EINVOICING_COUNTRY) return undefined;
  const [found] = await tx
    .select()
    .from(schema.order)
    .where(and(eq(schema.order.organizationId, organizationId), eq(schema.order.id, orderId)));
  if (!found) throw new DomainError("not_found", "No such order");
  if (found.status !== "paid") throw new DomainError("order_not_paid", "Only a paid order");
  const to = receiver === undefined ? receiverOf(found.taxId, found.email) : receiver;
  const kind: EinvoiceKind = to ? "invoice" : "ticket";
  const counter =
    kind === "invoice"
      ? schema.storeEinvoicing.nextInvoiceNumber
      : schema.storeEinvoicing.nextTicketNumber;
  // The update locks the settings row until the transaction ends, so numbers never repeat.
  const [settings] = await tx
    .update(schema.storeEinvoicing)
    .set(
      kind === "invoice"
        ? { nextInvoiceNumber: sql`${counter} + 1` }
        : { nextTicketNumber: sql`${counter} + 1` },
    )
    .where(
      and(
        eq(schema.storeEinvoicing.organizationId, organizationId),
        eq(schema.storeEinvoicing.enabled, true),
        onlyAuto ? eq(schema.storeEinvoicing.autoIssue, true) : undefined,
      ),
    )
    .returning();
  if (!settings) return undefined;
  const [live] = await tx
    .select({ id: schema.einvoice.id })
    .from(schema.einvoice)
    .where(and(eq(schema.einvoice.orderId, orderId), ne(schema.einvoice.status, "rejected")));
  if (live) throw new DomainError("einvoice_exists", "The order already has its document");

  const number = (kind === "invoice" ? settings.nextInvoiceNumber : settings.nextTicketNumber) - 1;
  const securityCode = String(randomInt(0, 100_000_000)).padStart(8, "0");
  const keys = comprobanteKeys({
    kind,
    idNumber: settings.idNumber ?? "",
    branch: settings.branch,
    terminal: settings.terminal,
    number,
    issuedAt: now,
    securityCode,
  });
  const [created] = await tx
    .insert(schema.einvoice)
    .values({
      organizationId,
      orderId,
      orderNumber: found.number,
      kind,
      environment: haciendaEnvironmentOf(settings.haciendaUsername),
      number,
      consecutive: keys.consecutive,
      clave: keys.clave,
      securityCode,
      issuedAt: now,
      receiver: to,
      currency: found.currency,
      total: found.total,
      nextAttemptAt: now,
    })
    .returning();
  return created;
}

/**
 * The store's "Issue invoice" on a paid order: to whom the shopper asked at checkout, to whom the
 * store types now, or a ticket. Only one live document per order; a rejected one can be redone.
 */
export async function issueOrderEinvoice(
  ctx: TenantContext,
  orderNumber: number,
  receiver?: OrderTaxId | null,
) {
  await requireAvailable(ctx);
  return ctx.db.transaction(async (tx) => {
    const [found] = await tx
      .select({ id: schema.order.id, email: schema.order.email, taxId: schema.order.taxId })
      .from(schema.order)
      .where(
        and(
          eq(schema.order.organizationId, ctx.organizationId),
          eq(schema.order.number, orderNumber),
        ),
      );
    if (!found) throw new DomainError("not_found", "No such order");
    if (receiver !== undefined) {
      await tx.update(schema.order).set({ taxId: receiver }).where(eq(schema.order.id, found.id));
    }
    const created = await queueOrderEinvoice(tx, {
      organizationId: ctx.organizationId,
      orderId: found.id,
      receiver: receiver === undefined ? undefined : receiverOf(receiver, found.email),
    });
    if (!created) throw new DomainError("einvoicing_off", "Invoicing is off");
    return created;
  });
}

/**
 * A document that could not be sent goes back to the queue, once the store fixed its details.
 * It keeps its number and clave; the XML is made again from the current details.
 */
export async function retryEinvoice(ctx: TenantContext, id: string) {
  const [updated] = await ctx.db
    .update(schema.einvoice)
    .set({
      status: "queued",
      problem: null,
      message: null,
      signedXml: null,
      attempts: 0,
      nextAttemptAt: new Date(),
      leaseUntil: null,
    })
    .where(
      and(
        eq(schema.einvoice.organizationId, ctx.organizationId),
        eq(schema.einvoice.id, id),
        eq(schema.einvoice.status, "failed"),
      ),
    )
    .returning({ id: schema.einvoice.id });
  if (!updated) throw new DomainError("not_failed", "Only a failed document is retried");
}

export interface EinvoiceRow {
  id: string;
  orderNumber: number;
  kind: EinvoiceKind;
  consecutive: string;
  clave: string;
  status: EinvoiceStatus;
  problem: EinvoiceProblem | null;
  message: string | null;
  receiverName: string | null;
  total: number;
  currency: string;
  environment: string;
  issuedAt: Date;
  hasDocument: boolean;
  hasResponse: boolean;
}

const rowColumns = {
  id: schema.einvoice.id,
  orderNumber: schema.einvoice.orderNumber,
  kind: schema.einvoice.kind,
  consecutive: schema.einvoice.consecutive,
  clave: schema.einvoice.clave,
  status: schema.einvoice.status,
  problem: schema.einvoice.problem,
  message: schema.einvoice.message,
  receiverName: sql<string | null>`${schema.einvoice.receiver} ->> 'name'`,
  total: schema.einvoice.total,
  currency: schema.einvoice.currency,
  environment: schema.einvoice.environment,
  issuedAt: schema.einvoice.issuedAt,
  hasDocument: sql<boolean>`${schema.einvoice.signedXml} is not null`,
  hasResponse: sql<boolean>`${schema.einvoice.responseXml} is not null`,
};

/** The store's documents, newest first; `attention` keeps the rejected and failed ones. */
export async function listEinvoices(
  ctx: TenantContext,
  { page = 1, attention = false }: { page?: number; attention?: boolean } = {},
): Promise<{ einvoices: EinvoiceRow[]; total: number; page: number; pages: number }> {
  const where = and(
    eq(schema.einvoice.organizationId, ctx.organizationId),
    attention ? inArray(schema.einvoice.status, ["rejected", "failed"]) : undefined,
  );
  const [totals] = await ctx.db.select({ total: count() }).from(schema.einvoice).where(where);
  const total = totals?.total ?? 0;
  const pages = Math.ceil(total / EINVOICES_PAGE_SIZE);
  const current = Math.min(Math.max(1, Math.floor(page)), Math.max(1, pages));
  const einvoices = await ctx.db
    .select(rowColumns)
    .from(schema.einvoice)
    .where(where)
    .orderBy(desc(schema.einvoice.createdAt))
    .limit(EINVOICES_PAGE_SIZE)
    .offset((current - 1) * EINVOICES_PAGE_SIZE);
  return { einvoices, total, page: current, pages };
}

/** How many documents need the store: rejected or failed. */
export async function countEinvoicesToReview(ctx: TenantContext): Promise<number> {
  const [row] = await ctx.db
    .select({ total: count() })
    .from(schema.einvoice)
    .where(
      and(
        eq(schema.einvoice.organizationId, ctx.organizationId),
        inArray(schema.einvoice.status, ["rejected", "failed"]),
      ),
    );
  return row?.total ?? 0;
}

/** An order's documents, newest first (a rejected one and the one that replaced it). */
export async function getOrderEinvoices(ctx: TenantContext, orderNumber: number) {
  return ctx.db
    .select(rowColumns)
    .from(schema.einvoice)
    .where(
      and(
        eq(schema.einvoice.organizationId, ctx.organizationId),
        eq(schema.einvoice.orderNumber, orderNumber),
      ),
    )
    .orderBy(desc(schema.einvoice.createdAt));
}

export type EinvoiceFile = "document" | "response";

/** The signed XML or Hacienda's answer, to download. Undefined if it doesn't exist yet. */
export async function getEinvoiceFile(ctx: TenantContext, id: string, file: EinvoiceFile) {
  const [found] = await ctx.db
    .select({
      clave: schema.einvoice.clave,
      signedXml: schema.einvoice.signedXml,
      responseXml: schema.einvoice.responseXml,
    })
    .from(schema.einvoice)
    .where(and(eq(schema.einvoice.organizationId, ctx.organizationId), eq(schema.einvoice.id, id)));
  const xml = file === "document" ? found?.signedXml : found?.responseXml;
  return found && xml ? { clave: found.clave, xml } : undefined;
}
