import { randomUUID } from "node:crypto";
import { createDatabase, type Database, type DatabaseConnection } from "./client";
import * as schema from "./schema";

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  return url;
}

export function createTestDatabase(): DatabaseConnection {
  return createDatabase(testDatabaseUrl());
}

export interface TestTenant {
  organizationId: string;
  slug: string;
  userId: string;
  role: string;
}

export interface TestTenantOptions {
  /** Adds the workspace to this existing user instead of creating a new owner. */
  userId?: string;
  role?: string;
}

/** Creates an isolated workspace + owner, so tests never share rows. */
export async function createTestTenant(
  db: Database,
  { userId, role = "owner" }: TestTenantOptions = {},
): Promise<TestTenant> {
  const suffix = randomUUID().slice(0, 8);
  const [org] = await db
    .insert(schema.organization)
    .values({ name: `Test ${suffix}`, slug: `test-${suffix}`, createdAt: new Date() })
    .returning({ id: schema.organization.id, slug: schema.organization.slug });
  if (!org) throw new Error("Failed to create test tenant");
  const ownerId = userId ?? (await createTestUser(db, suffix));
  await db
    .insert(schema.member)
    .values({ organizationId: org.id, userId: ownerId, role, createdAt: new Date() });
  return { organizationId: org.id, slug: org.slug, userId: ownerId, role };
}

export async function createTestUser(db: Database, suffix = randomUUID().slice(0, 8)) {
  const [user] = await db
    .insert(schema.user)
    .values({ name: `Owner ${suffix}`, email: `owner-${suffix}@test.monaztore.com` })
    .returning({ id: schema.user.id });
  if (!user) throw new Error("Failed to create test user");
  return user.id;
}
