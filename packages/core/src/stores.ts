import { and, asc, count, type Database, desc, eq, schema } from "@monaztore/db";
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

/** One store per instance (`single`, a standalone store) or many on their own domains. */
export type StoreMode = "single" | "multi";

/**
 * In a standalone instance (`STORE_MODE=single`), the store that answers on any host the
 * domains didn't claim: the instance's first workspace. Its links point to its main domain, or
 * to the host it was asked on while it has none.
 */
export async function resolveOnlyStore(
  db: Database,
  host: string | null | undefined,
): Promise<StorefrontStore | undefined> {
  const hostname = normalizeHostname(host);
  if (!hostname) return undefined;
  const [found] = await db
    .select({
      organizationId: schema.organization.id,
      name: schema.organization.name,
      slug: schema.organization.slug,
    })
    .from(schema.organization)
    .orderBy(asc(schema.organization.createdAt), asc(schema.organization.id))
    .limit(1);
  if (!found) return undefined;
  const [main] = await db
    .select({ hostname: schema.storeDomain.hostname })
    .from(schema.storeDomain)
    .where(eq(schema.storeDomain.organizationId, found.organizationId))
    .orderBy(desc(schema.storeDomain.primary))
    .limit(1);
  return { ...found, hostname: main?.hostname ?? hostname };
}

/** A standalone instance holds one store: once it exists, nobody opens another. */
export async function canOpenWorkspace(db: Database, mode: StoreMode): Promise<boolean> {
  if (mode === "multi") return true;
  const [row] = await db.select({ total: count() }).from(schema.organization);
  return (row?.total ?? 0) === 0;
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
