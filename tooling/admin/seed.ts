/**
 * Makes the people in SUPER_ADMIN_EMAILS (comma-separated) super admins: they open /admin with
 * their email link plus the authenticator app they set up on their first visit.
 *
 *   pnpm admin:seed
 *
 * Every deploy runs it after the migrations (fly.api.toml). It only adds the role, never takes
 * it away: removing someone is done from the database on purpose.
 */
import { promoteSuperAdmins } from "@monaztore/core";
import { createDatabase } from "@monaztore/db";
import { databaseEnvSchema, loadDotEnv, parseEnv, superAdminEnvSchema } from "@monaztore/env";

loadDotEnv();
const env = parseEnv(databaseEnvSchema.extend(superAdminEnvSchema.shape));
const emails = env.SUPER_ADMIN_EMAILS;
if (emails.length === 0) {
  console.log("SUPER_ADMIN_EMAILS is empty: no super admins to add.");
  process.exit(0);
}
const { db, close } = createDatabase(env.DATABASE_URL);
try {
  await promoteSuperAdmins(db, emails);
  console.log(`✓ Super admins: ${emails.join(", ")}`);
} finally {
  await close();
}
