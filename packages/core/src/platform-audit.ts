import { type Database, schema } from "@monaztore/db";

export type PlatformAuditAction = (typeof schema.platformAuditAction.enumValues)[number];

export interface PlatformAuditEntry {
  actorUserId: string | null;
  action: PlatformAuditAction;
  organizationId?: string | null;
  targetUserId?: string | null;
  details?: Record<string, unknown> | null;
}

/**
 * Writes one line of the platform's internal log. Stores never read it: only /admin does, so
 * it can record every support visit without telling the store.
 */
export async function recordAudit(db: Database, entry: PlatformAuditEntry): Promise<void> {
  await db.insert(schema.platformAuditLog).values(entry);
}
