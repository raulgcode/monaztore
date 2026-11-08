import { and, type Database, eq, schema } from "@monaztore/db";
import { DomainError } from "./errors";
import type { TenantContext } from "./tenant";

/**
 * `MiTienda.com:443` → `mitienda.com`. Hostnames are compared lowercase, without port or the
 * trailing dot DNS allows. Returns undefined for anything that isn't a hostname.
 */
export function normalizeHostname(host: string | null | undefined): string | undefined {
  if (!host) return undefined;
  const hostname = host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(hostname)) {
    return undefined;
  }
  return hostname;
}

export interface StorefrontStore {
  organizationId: string;
  name: string;
  slug: string;
  hostname: string;
}

/**
 * The store that answers at this Host, for the public storefront: the only place a store is
 * chosen without a signed-in member. `www.` falls back to the bare domain and vice versa, so a
 * store registered once answers on both.
 */
export async function resolveStoreByHost(
  db: Database,
  host: string | null | undefined,
): Promise<StorefrontStore | undefined> {
  const hostname = normalizeHostname(host);
  if (!hostname) return undefined;
  const alternate = hostname.startsWith("www.") ? hostname.slice(4) : `www.${hostname}`;
  for (const candidate of [hostname, alternate]) {
    const [found] = await db
      .select({
        organizationId: schema.organization.id,
        name: schema.organization.name,
        slug: schema.organization.slug,
        hostname: schema.storeDomain.hostname,
      })
      .from(schema.storeDomain)
      .innerJoin(schema.organization, eq(schema.organization.id, schema.storeDomain.organizationId))
      .where(eq(schema.storeDomain.hostname, candidate));
    if (found) return found;
  }
  return undefined;
}

/**
 * Connects a domain to the tenant's store. A hostname already taken by any store is refused; a
 * new main domain (`primary`) takes over from the old one.
 */
export async function addStoreDomain(
  ctx: TenantContext,
  host: string,
  { primary = false }: { primary?: boolean } = {},
): Promise<{ hostname: string }> {
  if (ctx.role !== "owner") throw new DomainError("forbidden", "Only owners manage domains");
  const hostname = normalizeHostname(host);
  if (!hostname?.includes(".")) throw new DomainError("invalid_hostname", `Not a domain: ${host}`);
  return ctx.db.transaction(async (tx) => {
    // A store has one main domain: a new one takes over.
    if (primary) {
      await tx
        .update(schema.storeDomain)
        .set({ primary: false })
        .where(eq(schema.storeDomain.organizationId, ctx.organizationId));
    }
    const [inserted] = await tx
      .insert(schema.storeDomain)
      .values({ organizationId: ctx.organizationId, hostname, primary })
      .onConflictDoNothing()
      .returning({ hostname: schema.storeDomain.hostname });
    if (!inserted) {
      throw new DomainError("hostname_taken", `${hostname} already belongs to a store`);
    }
    return inserted;
  });
}

/**
 * The store's owner, as a tenant, for operator tools run from a terminal with the database's
 * credentials (`pnpm import:woocommerce`). Never reachable from a request: whoever runs it
 * already has the whole database.
 */
export async function ownerContextForStore(
  db: Database,
  storeSlug: string,
): Promise<TenantContext | undefined> {
  const [found] = await db
    .select({ organizationId: schema.organization.id, userId: schema.member.userId })
    .from(schema.organization)
    .innerJoin(schema.member, eq(schema.member.organizationId, schema.organization.id))
    .where(and(eq(schema.organization.slug, storeSlug), eq(schema.member.role, "owner")))
    .limit(1);
  if (!found) return undefined;
  return { db, organizationId: found.organizationId, userId: found.userId, role: "owner" };
}
