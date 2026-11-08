import type { Database } from "@monaztore/db";

/**
 * Every use case receives the tenant explicitly. Queries must filter by
 * `organizationId`; nothing in core reads data across organizations.
 */
export interface TenantContext {
  db: Database;
  organizationId: string;
  userId: string;
  /** The user's role in this organization: "owner" or "member". */
  role: string;
}
