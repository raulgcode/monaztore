import { randomUUID } from "node:crypto";
import { and, eq, schema } from "@monaztore/db";
import { createTestDatabase, createTestTenant } from "@monaztore/db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  type PlatformAdminContext,
  platformAdminContext,
  promoteSuperAdmins,
} from "./platform-admin";
import {
  endSupportVisit,
  recentSupportVisits,
  recordSupportChange,
  startSupportVisit,
  supportTarget,
  supportVisitOf,
} from "./support";
import { resolveTenant } from "./workspaces";

const connection = createTestDatabase();
const db = connection.db;
afterAll(() => connection.close());

let admin: PlatformAdminContext;

async function newSession(userId: string): Promise<string> {
  const [row] = await db
    .insert(schema.session)
    .values({
      userId,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 3_600_000),
      updatedAt: new Date(),
    })
    .returning({ id: schema.session.id });
  if (!row) throw new Error("No session");
  return row.id;
}

async function actions(organizationId: string) {
  const rows = await db
    .select({ action: schema.platformAuditLog.action, details: schema.platformAuditLog.details })
    .from(schema.platformAuditLog)
    .where(
      and(
        eq(schema.platformAuditLog.organizationId, organizationId),
        eq(schema.platformAuditLog.actorUserId, admin.userId),
      ),
    )
    .orderBy(schema.platformAuditLog.createdAt);
  return rows;
}

beforeEach(async () => {
  const [userId] = await promoteSuperAdmins(db, [`admin-${randomUUID()}@test.monaztore.com`]);
  const ctx = userId ? await platformAdminContext(db, userId) : undefined;
  if (!ctx) throw new Error("No admin context");
  admin = ctx;
});

describe("entering a store's account for support", () => {
  it("enters as the store's owner and logs the visit, each change and the way out", async () => {
    const tenant = await createTestTenant(db);
    const target = await supportTarget(admin, tenant.organizationId);
    expect(target).toMatchObject({ userId: tenant.userId, slug: tenant.slug });

    const sessionId = await newSession(target.userId);
    await startSupportVisit(admin, {
      organizationId: tenant.organizationId,
      targetUserId: target.userId,
      sessionId,
      readOnly: false,
    });
    const visit = await supportVisitOf(db, sessionId);
    expect(visit).toMatchObject({ adminUserId: admin.userId, readOnly: false });
    if (!visit) throw new Error("No visit");

    await recordSupportChange(db, visit, { method: "POST", path: "/app/x/store" });
    await endSupportVisit(db, visit);

    expect(await supportVisitOf(db, sessionId)).toBeNull();
    expect(await actions(tenant.organizationId)).toEqual([
      { action: "support_started", details: { readOnly: false } },
      { action: "support_change", details: { method: "POST", path: "/app/x/store" } },
      { action: "support_ended", details: null },
    ]);
  });

  it("has no visit for anyone's own session", async () => {
    const tenant = await createTestTenant(db);
    expect(await supportVisitOf(db, await newSession(tenant.userId))).toBeNull();
  });

  it("refuses to enter another super admin's store", async () => {
    const tenant = await createTestTenant(db, { userId: admin.userId });
    await expect(supportTarget(admin, tenant.organizationId)).rejects.toThrow(/super admin/);
  });
});

describe("what a store sees of support visits", () => {
  it("shows its own visits only while the platform tells stores, never another store's", async () => {
    const tenant = await createTestTenant(db);
    const other = await createTestTenant(db);
    const ctx = await resolveTenant(db, tenant.userId, tenant.slug);
    if (!ctx) throw new Error("No tenant");
    await startSupportVisit(admin, {
      organizationId: tenant.organizationId,
      targetUserId: tenant.userId,
      sessionId: await newSession(tenant.userId),
      readOnly: true,
    });
    await startSupportVisit(admin, {
      organizationId: other.organizationId,
      targetUserId: other.userId,
      sessionId: await newSession(other.userId),
      readOnly: false,
    });

    const [settings] = await db.select().from(schema.platformSettings);
    const notify = (value: boolean) =>
      db
        .insert(schema.platformSettings)
        .values({ id: "platform", notifySupportAccess: value })
        .onConflictDoUpdate({
          target: schema.platformSettings.id,
          set: { notifySupportAccess: value },
        });
    try {
      await notify(false);
      expect(await recentSupportVisits(ctx)).toEqual([]);
      await notify(true);
      expect(await recentSupportVisits(ctx)).toEqual([
        { startedAt: expect.any(Date), readOnly: true },
      ]);
    } finally {
      // One row for the whole database: leave it as it was.
      await notify(settings?.notifySupportAccess ?? false);
    }
  });
});
