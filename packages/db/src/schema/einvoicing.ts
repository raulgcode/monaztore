import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { order } from "./commerce";

// Electronic invoicing with Costa Rica's Hacienda (comprobantes electrónicos v4.4). Only for stores
// whose `store_settings.country` is CR. Every table carries organization_id.

/** 01 physical person, 02 company, 03 DIMEX, 04 NITE. */
export type TaxIdType = "01" | "02" | "03" | "04";

/** Whom a document is made out to. */
export interface TaxReceiver {
  idType: TaxIdType;
  idNumber: string;
  name: string;
  email?: string;
}

/**
 * A store's details as a taxpayer, its key to sign and its ATV user. One row per store, made when
 * the owner first saves anything. Password, key and PIN are sealed (AES-256-GCM with a key
 * derived from BETTER_AUTH_SECRET, `sealSecret` in core); never stored or shown in clear.
 */
export const storeEinvoicing = pgTable("store_einvoicing", {
  organizationId: uuid()
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  /** On: paid orders get their document. Only once everything below is filled in. */
  enabled: boolean().notNull().default(false),
  /** Issue as soon as an order is marked paid; off, only from the order's button. */
  autoIssue: boolean().notNull().default(true),
  idType: text().$type<TaxIdType>(),
  idNumber: text(),
  name: text().notNull().default(""),
  commercialName: text().notNull().default(""),
  email: text().notNull().default(""),
  phone: text().notNull().default(""),
  /** Six digits: the economic activity Hacienda has for the taxpayer. */
  activityCode: text().notNull().default(""),
  province: text().notNull().default(""),
  canton: text().notNull().default(""),
  district: text().notNull().default(""),
  address: text().notNull().default(""),
  /** The CABYS code of what the store sells, for every line (13 digits). */
  cabys: text().notNull().default(""),
  cabysDescription: text().notNull().default(""),
  /** Branch (1–999) and terminal (1–99999) in the consecutive number. */
  branch: integer().notNull().default(1),
  terminal: integer().notNull().default(1),
  /** ATV's user: its domain says the environment (`@stag.` is Hacienda's sandbox). */
  haciendaUsername: text().notNull().default(""),
  haciendaPassword: text(),
  /** The .p12 in base64, sealed. */
  certificate: text(),
  certificatePin: text(),
  certificateSubject: text(),
  certificateExpiresAt: timestamp({ withTimezone: true }),
  /** The numbers the next invoice (01) and ticket (04) get. Taken under the row's lock. */
  nextInvoiceNumber: integer().notNull().default(1),
  nextTicketNumber: integer().notNull().default(1),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * queued → waiting to be signed and sent; sent → Hacienda has it and is checking it; accepted;
 * rejected (a new one can be issued); failed (it could not be sent after several tries: the
 * store fixes its details and retries).
 */
export type EinvoiceStatus = "queued" | "sent" | "accepted" | "rejected" | "failed";
export type EinvoiceKind = "invoice" | "ticket";
/**
 * rejected: Hacienda said no (its reason is in `message`); credentials: the ATV user or password;
 * certificate: the key or its PIN, or it expired; invalid: the document didn't follow v4.4;
 * unreachable: Hacienda didn't answer after many tries.
 */
export type EinvoiceProblem =
  | "rejected"
  | "credentials"
  | "certificate"
  | "invalid"
  | "unreachable";

/** One electronic document: an invoice (01) or a ticket (04) for an order. Never deleted. */
export const einvoice = pgTable(
  "einvoice",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    orderId: uuid().references(() => order.id, { onDelete: "set null" }),
    orderNumber: integer().notNull(),
    kind: text().$type<EinvoiceKind>().notNull(),
    /** "sandbox" or "production", from the ATV user at the time. */
    environment: text().notNull(),
    number: integer().notNull(),
    consecutive: text().notNull(),
    clave: text().notNull(),
    securityCode: text().notNull(),
    issuedAt: timestamp({ withTimezone: true }).notNull(),
    receiver: jsonb().$type<TaxReceiver>(),
    currency: text().notNull(),
    /** Minor units, as the order. */
    total: bigint({ mode: "number" }).notNull(),
    status: text().$type<EinvoiceStatus>().notNull().default("queued"),
    /** What Hacienda received, signed. Kept: the law asks for five years. */
    signedXml: text(),
    /** Hacienda's answer (MensajeHacienda). */
    responseXml: text(),
    /** What went wrong, for the store: a code the app translates (see `EinvoiceProblem`). */
    problem: text().$type<EinvoiceProblem>(),
    /** Hacienda's own words when it rejects, or the error for developers. */
    message: text(),
    attempts: integer().notNull().default(0),
    nextAttemptAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** A worker is on it until then. */
    leaseUntil: timestamp({ withTimezone: true }),
    sentAt: timestamp({ withTimezone: true }),
    decidedAt: timestamp({ withTimezone: true }),
    /** When the buyer got it by email. */
    emailedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("einvoice_clave_idx").on(table.clave),
    uniqueIndex("einvoice_consecutive_idx").on(
      table.organizationId,
      table.environment,
      table.consecutive,
    ),
    // One live document per order: only a rejected one leaves room for another.
    uniqueIndex("einvoice_order_idx").on(table.orderId).where(sql`${table.status} <> 'rejected'`),
    index("einvoice_organization_idx").on(table.organizationId, table.createdAt),
    index("einvoice_due_idx").on(table.status, table.nextAttemptAt),
  ],
);
