import { ADMIN_STORES_PAGE_SIZE, COMMISSION_MAX_BPS } from "@monaztore/contracts";
import {
  alias,
  and,
  asc,
  count,
  type Database,
  desc,
  eq,
  ilike,
  isNotNull,
  or,
  schema,
  sql,
} from "@monaztore/db";
import { DomainError, NotFoundError } from "./errors";
import { type PlatformAuditAction, recordAudit } from "./platform-audit";

/** The role on `user.role` that opens /admin (Better Auth's admin plugin). */
export const SUPER_ADMIN_ROLE = "admin";
const PLATFORM = "platform";

/**
 * A verified super admin: the platform's operator. The only context in core that reads across
 * stores; every function here takes it, and `platformAdminContext` is the only way to get one.
 */
export interface PlatformAdminContext {
  db: Database;
  userId: string;
  readonly kind: "super-admin";
}

/** Reads the role from the database, not from a cached session. */
export async function platformAdminContext(
  db: Database,
  userId: string,
): Promise<PlatformAdminContext | undefined> {
  const [found] = await db
    .select({ role: schema.user.role })
    .from(schema.user)
    .where(eq(schema.user.id, userId));
  return found?.role === SUPER_ADMIN_ROLE ? { db, userId, kind: "super-admin" } : undefined;
}

/**
 * Makes these emails super admins (`pnpm admin:seed` with SUPER_ADMIN_EMAILS): an account that
 * doesn't exist yet is created, so its first email link already opens /admin.
 */
export async function promoteSuperAdmins(db: Database, emails: string[]): Promise<string[]> {
  const normalized = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (normalized.length === 0) return [];
  const rows = await db
    .insert(schema.user)
    .values(normalized.map((email) => ({ email, name: "", role: SUPER_ADMIN_ROLE })))
    .onConflictDoUpdate({ target: schema.user.email, set: { role: SUPER_ADMIN_ROLE } })
    .returning({ id: schema.user.id });
  return rows.map((row) => row.id);
}

// ── Settings and commissions ────────────────────────────────────────────────────────────

export interface PlatformSettings {
  /** Basis points charged on card sales (250 = 2.5 %); SINPE and transfers pay nothing. */
  cardCommissionBps: number;
  /** Whether a store is told when support enters its workspace. Off at first. */
  notifySupportAccess: boolean;
}

const defaults: PlatformSettings = { cardCommissionBps: 300, notifySupportAccess: false };

async function readSettings(db: Database): Promise<PlatformSettings> {
  const [row] = await db
    .select({
      cardCommissionBps: schema.platformSettings.cardCommissionBps,
      notifySupportAccess: schema.platformSettings.notifySupportAccess,
    })
    .from(schema.platformSettings)
    .where(eq(schema.platformSettings.id, PLATFORM));
  return row ?? defaults;
}

export function getPlatformSettings(ctx: PlatformAdminContext): Promise<PlatformSettings> {
  return readSettings(ctx.db);
}

function checkBps(bps: number) {
  if (!Number.isInteger(bps) || bps < 0 || bps > COMMISSION_MAX_BPS) {
    throw new DomainError("commission_invalid", "Commission out of range");
  }
}

async function saveSettings(
  ctx: PlatformAdminContext,
  change: Partial<PlatformSettings>,
  action: PlatformAuditAction,
) {
  const before = await readSettings(ctx.db);
  const after = { ...before, ...change };
  await ctx.db.transaction(async (tx) => {
    await tx
      .insert(schema.platformSettings)
      .values({ id: PLATFORM, ...after })
      .onConflictDoUpdate({ target: schema.platformSettings.id, set: change });
    await recordAudit(tx, { actorUserId: ctx.userId, action, details: { before, after: change } });
  });
}

/** The commission every store pays on card sales unless it has its own. */
export async function setDefaultCommission(ctx: PlatformAdminContext, bps: number) {
  checkBps(bps);
  await saveSettings(ctx, { cardCommissionBps: bps }, "commission_default_changed");
}

/** Whether stores are told when support enters; the internal log records it either way. */
export async function setSupportNotice(ctx: PlatformAdminContext, notify: boolean) {
  await saveSettings(ctx, { notifySupportAccess: notify }, "support_notice_changed");
}

/**
 * One store's own commission on card sales, or `null` to follow the platform's again. The
 * note says why ("socio fundador", "acuerdo de 2026").
 */
export async function setStoreCommission(
  ctx: PlatformAdminContext,
  organizationId: string,
  { bps, note }: { bps: number | null; note?: string | null },
) {
  if (bps !== null) checkBps(bps);
  const [store] = await ctx.db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId));
  if (!store) throw new NotFoundError("Store");
  const [before] = await ctx.db
    .select({ bps: schema.storeAgreement.cardCommissionBps, note: schema.storeAgreement.note })
    .from(schema.storeAgreement)
    .where(eq(schema.storeAgreement.organizationId, organizationId));
  const values = { cardCommissionBps: bps, note: note?.trim() || null };
  await ctx.db.transaction(async (tx) => {
    await tx
      .insert(schema.storeAgreement)
      .values({ organizationId, ...values })
      .onConflictDoUpdate({ target: schema.storeAgreement.organizationId, set: values });
    await recordAudit(tx, {
      actorUserId: ctx.userId,
      action: "commission_store_changed",
      organizationId,
      details: { before: before ?? null, after: { bps, note: values.note } },
    });
  });
}

/**
 * What a store pays on a card sale, in basis points: its own commission, or the platform's.
 * Card payments read it when they charge; it is never shown to shoppers.
 */
export async function cardCommissionBpsFor(db: Database, organizationId: string): Promise<number> {
  const [own] = await db
    .select({ bps: schema.storeAgreement.cardCommissionBps })
    .from(schema.storeAgreement)
    .where(
      and(
        eq(schema.storeAgreement.organizationId, organizationId),
        isNotNull(schema.storeAgreement.cardCommissionBps),
      ),
    );
  return own?.bps ?? (await readSettings(db)).cardCommissionBps;
}

// ── Stores ──────────────────────────────────────────────────────────────────────────────

export interface AdminStoreRow {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  ownerEmail: string | null;
  primaryDomain: string | null;
  products: number;
  orders: number;
  /** Its own commission in basis points, or null when it follows the platform's. */
  ownCommissionBps: number | null;
}

export interface AdminPage<T> {
  rows: T[];
  total: number;
  page: number;
  pages: number;
}

const productCount = sql<number>`(select count(*)::int from ${schema.product} where ${schema.product.organizationId} = ${schema.organization.id})`;
const orderCount = sql<number>`(select count(*)::int from ${schema.order} where ${schema.order.organizationId} = ${schema.organization.id})`;
const primaryDomain = sql<
  string | null
>`(select ${schema.storeDomain.hostname} from ${schema.storeDomain} where ${schema.storeDomain.organizationId} = ${schema.organization.id} order by ${schema.storeDomain.primary} desc, ${schema.storeDomain.createdAt} limit 1)`;
const ownerEmail = sql<
  string | null
>`(select ${schema.user.email} from ${schema.member} join ${schema.user} on ${schema.user.id} = ${schema.member.userId} where ${schema.member.organizationId} = ${schema.organization.id} and ${schema.member.role} = 'owner' order by ${schema.member.createdAt} limit 1)`;

/** Every store, newest first, searched by name, address, domain or owner's email. */
export async function listStores(
  ctx: PlatformAdminContext,
  { q = "", page = 1 }: { q?: string; page?: number } = {},
): Promise<AdminPage<AdminStoreRow>> {
  const term = q.trim();
  const pattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const where = term
    ? or(
        ilike(schema.organization.name, pattern),
        ilike(schema.organization.slug, pattern),
        sql`exists (select 1 from ${schema.storeDomain} where ${schema.storeDomain.organizationId} = ${schema.organization.id} and ${schema.storeDomain.hostname} ilike ${pattern})`,
        sql`exists (select 1 from ${schema.member} join ${schema.user} on ${schema.user.id} = ${schema.member.userId} where ${schema.member.organizationId} = ${schema.organization.id} and ${schema.user.email} ilike ${pattern})`,
      )
    : undefined;
  const [rows, [totals]] = await Promise.all([
    ctx.db
      .select({
        id: schema.organization.id,
        name: schema.organization.name,
        slug: schema.organization.slug,
        createdAt: schema.organization.createdAt,
        ownerEmail,
        primaryDomain,
        products: productCount,
        orders: orderCount,
        ownCommissionBps: schema.storeAgreement.cardCommissionBps,
      })
      .from(schema.organization)
      .leftJoin(
        schema.storeAgreement,
        eq(schema.storeAgreement.organizationId, schema.organization.id),
      )
      .where(where)
      .orderBy(desc(schema.organization.createdAt), asc(schema.organization.id))
      .limit(ADMIN_STORES_PAGE_SIZE)
      .offset((page - 1) * ADMIN_STORES_PAGE_SIZE),
    ctx.db.select({ value: count() }).from(schema.organization).where(where),
  ]);
  const total = totals?.value ?? 0;
  return {
    rows,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / ADMIN_STORES_PAGE_SIZE)),
  };
}

export interface AdminStoreMember {
  userId: string;
  name: string;
  email: string;
  role: string;
  /** Whether they set up the authenticator app: the second step of their sign-in. */
  hasMfa: boolean;
  passkeys: number;
}

export interface AdminStoreDetail {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  currency: string;
  country: string;
  domains: { hostname: string; primary: boolean }[];
  members: AdminStoreMember[];
  products: { total: number; active: number };
  orders: { total: number; paid: number; pendingPayment: number };
  /** What paid orders add up to, in the store's currency's minor units. */
  paidTotal: number;
  commission: { defaultBps: number; ownBps: number | null; note: string | null };
}

/** One store as support sees it: who runs it, its domains, its numbers and its commission. */
export async function getStore(
  ctx: PlatformAdminContext,
  organizationId: string,
): Promise<AdminStoreDetail> {
  const [store] = await ctx.db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      slug: schema.organization.slug,
      createdAt: schema.organization.createdAt,
      currency: schema.storeSettings.currency,
      country: schema.storeSettings.country,
      ownBps: schema.storeAgreement.cardCommissionBps,
      note: schema.storeAgreement.note,
    })
    .from(schema.organization)
    .leftJoin(schema.storeSettings, eq(schema.storeSettings.organizationId, schema.organization.id))
    .leftJoin(
      schema.storeAgreement,
      eq(schema.storeAgreement.organizationId, schema.organization.id),
    )
    .where(eq(schema.organization.id, organizationId));
  if (!store) throw new NotFoundError("Store");

  const totp = alias(schema.userTotp, "member_totp");
  const [domains, members, [products], [orders], settings] = await Promise.all([
    ctx.db
      .select({ hostname: schema.storeDomain.hostname, primary: schema.storeDomain.primary })
      .from(schema.storeDomain)
      .where(eq(schema.storeDomain.organizationId, organizationId))
      .orderBy(desc(schema.storeDomain.primary), asc(schema.storeDomain.hostname)),
    ctx.db
      .select({
        userId: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        role: schema.member.role,
        hasMfa: sql<boolean>`${totp.confirmedAt} is not null`,
        passkeys: sql<number>`(select count(*)::int from ${schema.passkey} where ${schema.passkey.userId} = ${schema.user.id})`,
      })
      .from(schema.member)
      .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
      .leftJoin(totp, eq(totp.userId, schema.user.id))
      .where(eq(schema.member.organizationId, organizationId))
      .orderBy(asc(schema.member.createdAt)),
    ctx.db
      .select({
        total: count(),
        active: sql<number>`count(*) filter (where ${schema.product.status} = 'active')::int`,
      })
      .from(schema.product)
      .where(eq(schema.product.organizationId, organizationId)),
    ctx.db
      .select({
        total: count(),
        paid: sql<number>`count(*) filter (where ${schema.order.paidAt} is not null)::int`,
        pendingPayment: sql<number>`count(*) filter (where ${schema.order.status} = 'pending_payment')::int`,
        paidTotal: sql<number>`coalesce(sum(${schema.order.total}) filter (where ${schema.order.paidAt} is not null), 0)::bigint`,
      })
      .from(schema.order)
      .where(eq(schema.order.organizationId, organizationId)),
    readSettings(ctx.db),
  ]);

  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    createdAt: store.createdAt,
    currency: store.currency ?? "CRC",
    country: store.country ?? "CR",
    domains,
    members,
    products: { total: products?.total ?? 0, active: products?.active ?? 0 },
    orders: {
      total: orders?.total ?? 0,
      paid: orders?.paid ?? 0,
      pendingPayment: orders?.pendingPayment ?? 0,
    },
    paidTotal: Number(orders?.paidTotal ?? 0),
    commission: {
      defaultBps: settings.cardCommissionBps,
      ownBps: store.ownBps,
      note: store.note,
    },
  };
}

// ── The internal log ────────────────────────────────────────────────────────────────────

export interface AuditLogRow {
  id: string;
  action: PlatformAuditAction;
  createdAt: Date;
  actorEmail: string | null;
  store: { id: string; name: string } | null;
  targetEmail: string | null;
  details: Record<string, unknown> | null;
}

export const AUDIT_PAGE_SIZE = 50;

/** The platform's log, newest first; with `organizationId`, only what touched that store. */
export async function listAuditLog(
  ctx: PlatformAdminContext,
  { organizationId, page = 1 }: { organizationId?: string; page?: number } = {},
): Promise<AdminPage<AuditLogRow>> {
  const actor = alias(schema.user, "actor");
  const target = alias(schema.user, "target");
  const where = organizationId
    ? eq(schema.platformAuditLog.organizationId, organizationId)
    : undefined;
  const [rows, [totals]] = await Promise.all([
    ctx.db
      .select({
        id: schema.platformAuditLog.id,
        action: schema.platformAuditLog.action,
        createdAt: schema.platformAuditLog.createdAt,
        actorEmail: actor.email,
        storeId: schema.organization.id,
        storeName: schema.organization.name,
        targetEmail: target.email,
        details: schema.platformAuditLog.details,
      })
      .from(schema.platformAuditLog)
      .leftJoin(actor, eq(actor.id, schema.platformAuditLog.actorUserId))
      .leftJoin(target, eq(target.id, schema.platformAuditLog.targetUserId))
      .leftJoin(
        schema.organization,
        eq(schema.organization.id, schema.platformAuditLog.organizationId),
      )
      .where(where)
      .orderBy(desc(schema.platformAuditLog.createdAt), desc(schema.platformAuditLog.id))
      .limit(AUDIT_PAGE_SIZE)
      .offset((page - 1) * AUDIT_PAGE_SIZE),
    ctx.db.select({ value: count() }).from(schema.platformAuditLog).where(where),
  ]);
  const total = totals?.value ?? 0;
  return {
    rows: rows.map(({ storeId, storeName, ...row }) => ({
      ...row,
      store: storeId && storeName ? { id: storeId, name: storeName } : null,
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
  };
}
