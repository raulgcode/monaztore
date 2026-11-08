import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, session, user } from "./auth";

// The platform operator's own data (super admins in /admin): it spans every store, so only
// `PlatformAdminContext` in core reads it.

/**
 * One row (`id = "platform"`): what applies to every store unless the store has its own.
 * Commissions are basis points (250 = 2.5 %) and only apply to card payments; SINPE and bank
 * transfers never pay one.
 */
export const platformSettings = pgTable("platform_settings", {
  id: text().primaryKey().default("platform"),
  cardCommissionBps: integer().notNull().default(300),
  /** Off at first: support visits are logged for the platform, but stores aren't told. */
  notifySupportAccess: boolean().notNull().default(false),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** What the platform agreed with one store; empty columns follow `platform_settings`. */
export const storeAgreement = pgTable("store_agreement", {
  organizationId: uuid()
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  cardCommissionBps: integer(),
  note: text(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const platformAuditAction = pgEnum("platform_audit_action", [
  "mfa_enrolled",
  "mfa_reset",
  "passkey_added",
  "passkey_removed",
  "commission_default_changed",
  "commission_store_changed",
  "support_notice_changed",
  "super_admin_added",
  "support_started",
  "support_ended",
  "support_change",
]);

/**
 * The platform's internal log: every super admin change and security event. Only super admins
 * read it; stores never see it.
 */
export const platformAuditLog = pgTable(
  "platform_audit_log",
  {
    id: uuid().defaultRandom().primaryKey(),
    actorUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    action: platformAuditAction().notNull(),
    organizationId: uuid().references(() => organization.id, { onDelete: "set null" }),
    targetUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    details: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("platform_audit_log_created_idx").on(table.createdAt),
    index("platform_audit_log_organization_idx").on(table.organizationId, table.createdAt),
  ],
);

/**
 * A super admin inside a store's account for support ("Entrar como dueño"): Better Auth's
 * impersonation session, what it may do and when it ended. `readOnly` refuses every change.
 * A store sees its visits only while `platform_settings.notifySupportAccess` is on.
 */
export const supportVisit = pgTable(
  "support_visit",
  {
    id: uuid().defaultRandom().primaryKey(),
    sessionId: uuid().references(() => session.id, { onDelete: "set null" }),
    adminUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    organizationId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    targetUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    readOnly: boolean().notNull().default(false),
    startedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index("support_visit_session_idx").on(table.sessionId),
    index("support_visit_organization_idx").on(table.organizationId, table.startedAt),
  ],
);
