import { randomUUID } from "node:crypto";
import { listStoreProducts, resolveStoreByHost } from "@monaztore/core";
import { eq, schema } from "@monaztore/db";
import { createTestDatabase } from "@monaztore/db/testing";
import { afterAll, describe, expect, it } from "vitest";
import { removeSandbox, type SandboxOptions, seedSandbox } from "./seed";

const connection = createTestDatabase();
afterAll(() => connection.close());
const db = connection.db;

const options = (): SandboxOptions => {
  const id = randomUUID().slice(0, 8);
  return {
    slug: `sandbox-${id}`,
    name: "Sandbox",
    hostname: `sandbox-${id}.localhost`,
    email: `owner-${id}@sandbox.test`,
  };
};

describe("seedSandbox", () => {
  it("opens a store on its own domain with the catalog for sale, and a second run changes nothing", async () => {
    const sandbox = options();

    const first = await seedSandbox(db, sandbox);
    const second = await seedSandbox(db, sandbox);

    expect(first.created).toBe(true);
    expect(second).toMatchObject({ created: false, organizationId: first.organizationId });
    const store = await resolveStoreByHost(db, sandbox.hostname);
    if (!store) throw new Error("The sandbox's domain doesn't answer");
    expect(store.organizationId).toBe(first.organizationId);
    // Six for sale; the draft stays hidden.
    expect((await listStoreProducts({ db, store })).total).toBe(6);
    const members = await db
      .select()
      .from(schema.member)
      .where(eq(schema.member.organizationId, first.organizationId));
    expect(members).toHaveLength(1);
  });

  it("removes the sandbox's workspace, store and owner", async () => {
    const sandbox = options();
    await seedSandbox(db, sandbox);

    await removeSandbox(db, sandbox);

    expect(await resolveStoreByHost(db, sandbox.hostname)).toBeUndefined();
    expect(await db.select().from(schema.user).where(eq(schema.user.email, sandbox.email))).toEqual(
      [],
    );
  });
});
