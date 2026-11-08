import { and, type Database, desc, eq, gte, isNull, schema } from "@monaztore/db";
import { DomainError, NotFoundError } from "./errors";
import { type PlatformAdminContext, SUPER_ADMIN_ROLE } from "./platform-admin";
import { recordAudit } from "./platform-audit";
import type { TenantContext } from "./tenant";

// "Entrar como dueño": a super admin inside a store's account to fix something. Better Auth's
// impersonation makes the session; this keeps what it may do and the platform's record of it.

/** How long a store sees that support entered (only with the notice on). */
export const SUPPORT_NOTICE_DAYS = 30;

export interface SupportTarget {
  userId: string;
  email: string;
  slug: string;
}

/**
 * Whose account support enters for a store: its first owner. Never another super admin, so
 * one admin can't act as another.
 */
export async function supportTarget(
  ctx: PlatformAdminContext,
  organizationId: string,
): Promise<SupportTarget> {
  const [owner] = await ctx.db
    .select({
      userId: schema.user.id,
      email: schema.user.email,
      role: schema.user.role,
      slug: schema.organization.slug,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.role, "owner")))
    .orderBy(schema.member.createdAt)
    .limit(1);
  if (!owner) throw new NotFoundError("Store owner");
  if (owner.role === SUPER_ADMIN_ROLE) {
    throw new DomainError("support_admin", "Cannot enter another super admin's account");
  }
  return { userId: owner.userId, email: owner.email, slug: owner.slug };
}

/** Keeps the support session that just started, and logs it. */
export async function startSupportVisit(
  ctx: PlatformAdminContext,
  visit: { organizationId: string; targetUserId: string; sessionId: string; readOnly: boolean },
): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    await tx.insert(schema.supportVisit).values({ ...visit, adminUserId: ctx.userId });
    await recordAudit(tx, {
      actorUserId: ctx.userId,
      action: "support_started",
      organizationId: visit.organizationId,
      targetUserId: visit.targetUserId,
      details: { readOnly: visit.readOnly },
    });
  });
}

export interface SupportVisit {
  id: string;
  adminUserId: string | null;
  organizationId: string;
  targetUserId: string | null;
  readOnly: boolean;
}

/** The open support visit behind a session, or null for anyone's own session. */
export async function supportVisitOf(
  db: Database,
  sessionId: string,
): Promise<SupportVisit | null> {
  const [visit] = await db
    .select({
      id: schema.supportVisit.id,
      adminUserId: schema.supportVisit.adminUserId,
      organizationId: schema.supportVisit.organizationId,
      targetUserId: schema.supportVisit.targetUserId,
      readOnly: schema.supportVisit.readOnly,
    })
    .from(schema.supportVisit)
    .where(and(eq(schema.supportVisit.sessionId, sessionId), isNull(schema.supportVisit.endedAt)));
  return visit ?? null;
}

/** A change support made inside the store: the internal log keeps the method and the path. */
export async function recordSupportChange(
  db: Database,
  visit: SupportVisit,
  request: { method: string; path: string },
): Promise<void> {
  await recordAudit(db, {
    actorUserId: visit.adminUserId,
    action: "support_change",
    organizationId: visit.organizationId,
    targetUserId: visit.targetUserId,
    details: request,
  });
}

/** Support left the store ("Volver al admin"). */
export async function endSupportVisit(
  db: Database,
  visit: SupportVisit,
  now: Date = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(schema.supportVisit)
      .set({ endedAt: now })
      .where(and(eq(schema.supportVisit.id, visit.id), isNull(schema.supportVisit.endedAt)));
    await recordAudit(tx, {
      actorUserId: visit.adminUserId,
      action: "support_ended",
      organizationId: visit.organizationId,
      targetUserId: visit.targetUserId,
    });
  });
}

/**
 * The support visits a store sees on its home: the last `SUPPORT_NOTICE_DAYS` days, and only
 * while the platform tells stores about them. Empty otherwise.
 */
export async function recentSupportVisits(
  tenant: TenantContext,
  now: Date = new Date(),
): Promise<{ startedAt: Date; readOnly: boolean }[]> {
  const [settings] = await tenant.db
    .select({ notify: schema.platformSettings.notifySupportAccess })
    .from(schema.platformSettings)
    .where(eq(schema.platformSettings.id, "platform"));
  if (!settings?.notify) return [];
  const since = new Date(now.getTime() - SUPPORT_NOTICE_DAYS * 24 * 60 * 60 * 1000);
  return tenant.db
    .select({ startedAt: schema.supportVisit.startedAt, readOnly: schema.supportVisit.readOnly })
    .from(schema.supportVisit)
    .where(
      and(
        eq(schema.supportVisit.organizationId, tenant.organizationId),
        gte(schema.supportVisit.startedAt, since),
      ),
    )
    .orderBy(desc(schema.supportVisit.startedAt))
    .limit(5);
}
