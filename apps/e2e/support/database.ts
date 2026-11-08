import type { TenantContext } from "@monaztore/core";
import { and, createDatabase, type Database, eq, schema } from "@monaztore/db";
import type { Page } from "@playwright/test";

/** The e2e database: the one the web server of playwright.config.ts runs against. */
export function connectTestDatabase() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  return createDatabase(url);
}

/** A workspace of the test database, ready for `@monaztore/core`'s use cases. */
export interface Workspace {
  slug: string;
  organizationId: string;
  /** As its owner: what the panel would pass to core. */
  tenant: TenantContext;
}

/** The workspace in a panel URL (`/app/:workspace/…`). */
export function slugOf(page: Page | string): string {
  const url = typeof page === "string" ? page : page.url();
  const slug = new URL(url).pathname.match(/^\/app\/([^/]+)/)?.[1];
  if (!slug) throw new Error(`No workspace in ${url}`);
  return slug;
}

export async function findWorkspace(db: Database, slug: string): Promise<Workspace> {
  const [row] = await db
    .select({ organizationId: schema.organization.id, userId: schema.member.userId })
    .from(schema.organization)
    .innerJoin(schema.member, eq(schema.member.organizationId, schema.organization.id))
    .where(and(eq(schema.organization.slug, slug), eq(schema.member.role, "owner")));
  if (!row) throw new Error(`No workspace ${slug}`);
  return {
    slug,
    organizationId: row.organizationId,
    tenant: { db, organizationId: row.organizationId, userId: row.userId, role: "owner" },
  };
}
