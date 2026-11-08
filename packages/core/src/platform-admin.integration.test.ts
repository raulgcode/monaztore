import { randomUUID } from "node:crypto";
import { and, eq, schema } from "@monaztore/db";
import { createTestDatabase, createTestTenant, createTestUser } from "@monaztore/db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  cardCommissionBpsFor,
  getStore,
  listAuditLog,
  listStores,
  type PlatformAdminContext,
  platformAdminContext,
  promoteSuperAdmins,
  setDefaultCommission,
  setStoreCommission,
  setSupportNotice,
} from "./platform-admin";

const connection = createTestDatabase();
const db = connection.db;
afterAll(() => connection.close());

let admin: PlatformAdminContext;

async function newAdmin(): Promise<PlatformAdminContext> {
  const [userId] = await promoteSuperAdmins(db, [`admin-${randomUUID()}@test.monaztore.com`]);
  const ctx = userId ? await platformAdminContext(db, userId) : undefined;
  if (!ctx) throw new Error("No admin context");
  return ctx;
}

beforeEach(async () => {
  admin = await newAdmin();
});

describe("who is a super admin", () => {
  it("is only someone with the role in the database", async () => {
    const owner = await createTestUser(db);
    expect(await platformAdminContext(db, owner)).toBeUndefined();
    expect(await platformAdminContext(db, admin.userId)).toMatchObject({ kind: "super-admin" });
  });

  it("promotes an existing account and creates a missing one", async () => {
    const owner = await createTestUser(db);
    const [found] = await db
      .select({ email: schema.user.email })
      .from(schema.user)
      .where(eq(schema.user.id, owner));
    const fresh = `new-${randomUUID()}@test.monaztore.com`;

    const ids = await promoteSuperAdmins(db, [` ${found?.email.toUpperCase()} `, fresh]);

    expect(ids).toContain(owner);
    expect(ids).toHaveLength(2);
    expect(await platformAdminContext(db, owner)).toBeDefined();
  });
});

describe("the store list", () => {
  it("finds a store by name, address or owner's email and counts its products", async () => {
    const tenant = await createTestTenant(db);
    await db.insert(schema.product).values({
      organizationId: tenant.organizationId,
      name: "Camisa",
      slug: `camisa-${randomUUID().slice(0, 6)}`,
      status: "active",
    });

    const bySlug = await listStores(admin, { q: tenant.slug });
    expect(bySlug.rows).toEqual([
      expect.objectContaining({
        id: tenant.organizationId,
        slug: tenant.slug,
        products: 1,
        orders: 0,
        ownCommissionBps: null,
        ownerEmail: expect.stringContaining("@test.monaztore.com"),
      }),
    ]);
    const [owner] = await db
      .select({ email: schema.user.email })
      .from(schema.user)
      .where(eq(schema.user.id, tenant.userId));
    expect((await listStores(admin, { q: owner?.email })).rows.map((r) => r.id)).toEqual([
      tenant.organizationId,
    ]);
    expect((await listStores(admin, { q: `nothing-${randomUUID()}` })).total).toBe(0);
  });

  it("escapes the search, so % matches only a %", async () => {
    await createTestTenant(db);
    const result = await listStores(admin, { q: `%${randomUUID()}` });
    expect(result.rows).toEqual([]);
  });
});

describe("a store's detail", () => {
  it("shows its team with whether each one set up the second step", async () => {
    const tenant = await createTestTenant(db);
    await db
      .insert(schema.userTotp)
      .values({ userId: tenant.userId, secret: "x", recoveryCodes: [], confirmedAt: new Date() });

    const store = await getStore(admin, tenant.organizationId);

    expect(store).toMatchObject({
      id: tenant.organizationId,
      currency: "CRC",
      domains: [],
      products: { total: 0, active: 0 },
      orders: { total: 0, paid: 0, pendingPayment: 0 },
      paidTotal: 0,
      commission: { ownBps: null, note: null },
    });
    expect(store.members).toEqual([
      expect.objectContaining({ userId: tenant.userId, role: "owner", hasMfa: true, passkeys: 0 }),
    ]);
  });

  it("answers not found for a store that doesn't exist", async () => {
    await expect(getStore(admin, randomUUID())).rejects.toThrow(/not found/);
  });
});

describe("commissions on card sales", () => {
  it("charges the platform's commission until a store gets its own, and logs both", async () => {
    const tenant = await createTestTenant(db);
    const platform = await cardCommissionBpsFor(db, tenant.organizationId);
    expect(platform).toBeGreaterThanOrEqual(0);

    await setStoreCommission(admin, tenant.organizationId, { bps: 150, note: " Socio fundador " });
    expect(await cardCommissionBpsFor(db, tenant.organizationId)).toBe(150);
    expect((await getStore(admin, tenant.organizationId)).commission).toMatchObject({
      ownBps: 150,
      note: "Socio fundador",
    });

    await setStoreCommission(admin, tenant.organizationId, { bps: null });
    expect(await cardCommissionBpsFor(db, tenant.organizationId)).toBe(platform);

    const log = await listAuditLog(admin, { organizationId: tenant.organizationId });
    expect(log.rows.map((row) => row.action)).toEqual([
      "commission_store_changed",
      "commission_store_changed",
    ]);
    expect(log.rows[1]).toMatchObject({
      store: { id: tenant.organizationId },
      details: { before: null, after: { bps: 150, note: "Socio fundador" } },
    });
  });

  it("refuses a commission out of range and a store that doesn't exist", async () => {
    const tenant = await createTestTenant(db);
    await expect(setStoreCommission(admin, tenant.organizationId, { bps: 2500 })).rejects.toThrow(
      /out of range/,
    );
    await expect(setDefaultCommission(admin, -1)).rejects.toThrow(/out of range/);
    await expect(setStoreCommission(admin, randomUUID(), { bps: 100 })).rejects.toThrow(
      /not found/,
    );
  });

  it("changes the platform's commission for every store that follows it", async () => {
    const tenant = await createTestTenant(db);
    const before = await cardCommissionBpsFor(db, tenant.organizationId);
    try {
      await setDefaultCommission(admin, 275);
      expect(await cardCommissionBpsFor(db, tenant.organizationId)).toBe(275);
      const [entry] = await db
        .select()
        .from(schema.platformAuditLog)
        .where(
          and(
            eq(schema.platformAuditLog.actorUserId, admin.userId),
            eq(schema.platformAuditLog.action, "commission_default_changed"),
          ),
        );
      expect(entry?.details).toMatchObject({ after: { cardCommissionBps: 275 } });
    } finally {
      // The settings row is one for the whole database: leave it as it was.
      await setDefaultCommission(admin, before);
    }
  });

  it("logs turning the support notice on and off", async () => {
    await setSupportNotice(admin, false);
    const [entry] = await db
      .select()
      .from(schema.platformAuditLog)
      .where(
        and(
          eq(schema.platformAuditLog.actorUserId, admin.userId),
          eq(schema.platformAuditLog.action, "support_notice_changed"),
        ),
      );
    expect(entry?.details).toMatchObject({ after: { notifySupportAccess: false } });
  });
});
