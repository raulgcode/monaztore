import { createTestDatabase, createTestTenant } from "@monaztore/db/testing";
import { afterAll, describe, expect, it } from "vitest";
import { getWorkspace, listMemberships, resolveTenant } from "./workspaces";

const connection = createTestDatabase();
afterAll(() => connection.close());
const db = connection.db;

describe("resolveTenant", () => {
  it("gives the workspace to a member", async () => {
    const tenant = await createTestTenant(db);

    const ctx = await resolveTenant(db, tenant.userId, tenant.slug);

    expect(ctx).toMatchObject({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      role: "owner",
    });
  });

  it("doesn't give someone else's workspace: answers as if it didn't exist", async () => {
    const mine = await createTestTenant(db);
    const theirs = await createTestTenant(db);

    expect(await resolveTenant(db, mine.userId, theirs.slug)).toBeUndefined();
    expect(await resolveTenant(db, mine.userId, "no-existe")).toBeUndefined();
  });
});

describe("listMemberships", () => {
  it("lists the person's workspaces, oldest first", async () => {
    const first = await createTestTenant(db);
    const second = await createTestTenant(db, { userId: first.userId, role: "member" });

    const memberships = await listMemberships(db, first.userId);

    expect(memberships.map((membership) => [membership.slug, membership.role])).toEqual([
      [first.slug, "owner"],
      [second.slug, "member"],
    ]);
  });
});

describe("getWorkspace", () => {
  it("reads only the tenant's workspace", async () => {
    const tenant = await createTestTenant(db);
    const ctx = await resolveTenant(db, tenant.userId, tenant.slug);
    if (!ctx) throw new Error("no tenant");

    expect(await getWorkspace(ctx)).toEqual({
      id: tenant.organizationId,
      name: expect.stringMatching(/^Test /),
      slug: tenant.slug,
    });
  });
});
