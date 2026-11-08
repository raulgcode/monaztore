import { randomUUID } from "node:crypto";
import { createTestDatabase, createTestTenant } from "@monaztore/db/testing";
import { afterAll, describe, expect, it } from "vitest";
import { listStoreDomains } from "./store-admin";
import { addStoreDomain, normalizeHostname, resolveStoreByHost } from "./stores";
import { resolveTenant } from "./workspaces";

const connection = createTestDatabase();
afterAll(() => connection.close());
const db = connection.db;

async function ownerOf() {
  const tenant = await createTestTenant(db);
  const ctx = await resolveTenant(db, tenant.userId, tenant.slug);
  if (!ctx) throw new Error("no tenant");
  return { tenant, ctx };
}

const uniqueDomain = (name: string) => `${name}-${randomUUID().slice(0, 8)}.test`;

describe("normalizeHostname", () => {
  it.each([
    ["MiTienda.com:443", "mitienda.com"],
    ["mitienda.com.", "mitienda.com"],
    [" shop.example ", "shop.example"],
  ])("%s → %s", (host, expected) => {
    expect(normalizeHostname(host)).toBe(expected);
  });

  it.each([[""], [null], ["evil.com/path"], ["a b.com"]])("refuses %s", (host) => {
    expect(normalizeHostname(host)).toBeUndefined();
  });
});

describe("resolveStoreByHost", () => {
  it("two stores on different domains each answer with their own store", async () => {
    const first = await ownerOf();
    const second = await ownerOf();
    const firstDomain = uniqueDomain("primera");
    const secondDomain = uniqueDomain("segunda");
    await addStoreDomain(first.ctx, firstDomain, { primary: true });
    await addStoreDomain(second.ctx, secondDomain);

    expect(await resolveStoreByHost(db, `${firstDomain.toUpperCase()}:443`)).toMatchObject({
      organizationId: first.tenant.organizationId,
      hostname: firstDomain,
    });
    expect((await resolveStoreByHost(db, secondDomain))?.organizationId).toBe(
      second.tenant.organizationId,
    );
  });

  it("answers on www. and on the bare domain alike", async () => {
    const { tenant, ctx } = await ownerOf();
    const domain = uniqueDomain("www-tienda");
    await addStoreDomain(ctx, domain);

    expect((await resolveStoreByHost(db, `www.${domain}`))?.organizationId).toBe(
      tenant.organizationId,
    );
  });

  it("an unknown domain has no store", async () => {
    expect(await resolveStoreByHost(db, uniqueDomain("nadie"))).toBeUndefined();
  });
});

describe("addStoreDomain", () => {
  it("refuses a domain another store already has", async () => {
    const first = await ownerOf();
    const second = await ownerOf();
    const domain = uniqueDomain("ocupado");
    await addStoreDomain(first.ctx, domain);

    await expect(addStoreDomain(second.ctx, domain)).rejects.toMatchObject({
      code: "hostname_taken",
    });
  });

  it("a new main domain takes over from the old one: a store has one main domain", async () => {
    const { ctx } = await ownerOf();
    const old = uniqueDomain("vieja");
    const next = uniqueDomain("nueva");
    await addStoreDomain(ctx, old, { primary: true });

    await addStoreDomain(ctx, next, { primary: true });

    expect(await listStoreDomains(ctx)).toEqual([
      { hostname: next, primary: true },
      { hostname: old, primary: false },
    ]);
  });

  it("only owners connect domains", async () => {
    const { ctx } = await ownerOf();
    await expect(
      addStoreDomain({ ...ctx, role: "member" }, uniqueDomain("x")),
    ).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});
