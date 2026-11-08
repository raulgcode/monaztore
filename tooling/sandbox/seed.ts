import {
  addStoreDomain,
  importCatalog,
  listStoreDomains,
  type TenantContext,
  updateStorePayments,
} from "@monaztore/core";
import { and, type Database, eq, schema } from "@monaztore/db";
import { project } from "@monaztore/env/project";
import { sandboxCatalog } from "./catalog";

export interface SandboxOptions {
  slug: string;
  name: string;
  /** A `*.localhost` host: the browser sends it to this machine with no DNS to set up. */
  hostname: string;
  email: string;
}

export const sandbox: SandboxOptions = {
  slug: "sandbox",
  name: "Sandbox",
  hostname: "sandbox.localhost",
  email: `owner@sandbox.${project.slug}.test`,
};

/** Why the sandbox can't go into this database, or undefined when it can (a local one). */
export function sandboxRefusal(
  databaseUrl: string,
  nodeEnv: string | undefined,
): string | undefined {
  if (nodeEnv === "production") return "NODE_ENV is production";
  const { hostname } = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname)) {
    return `the database is on ${hostname}, not on this machine`;
  }
  return undefined;
}

/**
 * A store to try things on: its owner, its workspace, a catalog, SINPE Móvil and transfer, and
 * its own `*.localhost` domain. Safe to run again: it finds what's there and fills in the rest
 * (the catalog comes back as it is here, like a second import).
 */
export async function seedSandbox(db: Database, options: SandboxOptions = sandbox) {
  const [found] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, options.email));
  const userId =
    found?.id ??
    (
      await db
        .insert(schema.user)
        .values({ name: `${options.name} owner`, email: options.email, emailVerified: true })
        .returning({ id: schema.user.id })
    )[0]?.id;
  if (!userId) throw new Error("Couldn't create the sandbox's owner");

  const [existing] = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .where(eq(schema.organization.slug, options.slug));
  const organizationId =
    existing?.id ??
    (
      await db
        .insert(schema.organization)
        .values({ name: options.name, slug: options.slug, createdAt: new Date() })
        .returning({ id: schema.organization.id })
    )[0]?.id;
  if (!organizationId) throw new Error("Couldn't create the sandbox's workspace");
  const [membership] = await db
    .select({ id: schema.member.id })
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, userId)));
  if (!membership) {
    await db
      .insert(schema.member)
      .values({ organizationId, userId, role: "owner", createdAt: new Date() });
  }

  const owner: TenantContext = { db, organizationId, userId, role: "owner" };
  await importCatalog(owner, sandboxCatalog);
  await updateStorePayments(owner, {
    sinpe: { enabled: true, phone: "8888-1234", holder: `${options.name} S.A.` },
    transfer: {
      enabled: true,
      bank: "Banco Nacional",
      iban: "CR05015202001026284066",
      holder: `${options.name} S.A.`,
    },
  });
  const domains = await listStoreDomains(owner);
  if (!domains.some((domain) => domain.hostname === options.hostname)) {
    await addStoreDomain(owner, options.hostname, { primary: true });
  }
  return { organizationId, userId, created: !existing };
}

/** Takes the sandbox away: its workspace (and with it its store) and its owner. */
export async function removeSandbox(db: Database, options: SandboxOptions = sandbox) {
  await db.delete(schema.organization).where(eq(schema.organization.slug, options.slug));
  await db.delete(schema.user).where(eq(schema.user.email, options.email));
}
