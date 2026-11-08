import { and, asc, type Database, eq, schema } from "@monaztore/db";
import { NotFoundError } from "./errors";
import type { TenantContext } from "./tenant";

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
}

/** The tenant's own workspace, for the layout's header. */
export async function getWorkspace(ctx: TenantContext): Promise<WorkspaceSummary> {
  const [found] = await ctx.db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      slug: schema.organization.slug,
    })
    .from(schema.organization)
    .where(eq(schema.organization.id, ctx.organizationId));
  if (!found) throw new NotFoundError("Workspace");
  return found;
}

export interface Membership {
  organizationId: string;
  name: string;
  slug: string;
  role: string;
}

const membershipColumns = {
  organizationId: schema.organization.id,
  name: schema.organization.name,
  slug: schema.organization.slug,
  role: schema.member.role,
};

/** Every workspace the user belongs to, oldest first: /app opens one of these. */
export function listMemberships(db: Database, userId: string): Promise<Membership[]> {
  return db
    .select(membershipColumns)
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .where(eq(schema.member.userId, userId))
    .orderBy(asc(schema.member.createdAt));
}

/**
 * The tenant for the workspace in the URL. This is the only place an `organizationId` enters the
 * app: if the user is not a member, there is no tenant (and the route answers 404).
 */
export async function resolveTenant(
  db: Database,
  userId: string,
  slug: string,
): Promise<TenantContext | undefined> {
  const [found] = await db
    .select(membershipColumns)
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .where(and(eq(schema.member.userId, userId), eq(schema.organization.slug, slug)));
  if (!found) return undefined;
  return { db, organizationId: found.organizationId, userId, role: found.role };
}
