/**
 * For a super admin (or a store's team member) who lost their phone and their recovery codes:
 * forgets their authenticator app and passkeys, so the next sign-in sets them up again. The
 * platform's internal log records it.
 *
 *   pnpm admin:reset-2fa ana@example.com
 *
 * Run it only after checking who is asking: whoever has the email link gets in next.
 */
import { resetMfa } from "@monaztore/core";
import { createDatabase, eq, schema } from "@monaztore/db";
import { databaseEnvSchema, loadDotEnv, parseEnv } from "@monaztore/env";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("✗ Usage: pnpm admin:reset-2fa <email>");
  process.exit(1);
}
loadDotEnv();
const env = parseEnv(databaseEnvSchema);
const { db, close } = createDatabase(env.DATABASE_URL);
try {
  const [user] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email));
  if (!user) {
    console.error(`✗ No account with ${email}`);
    process.exitCode = 1;
  } else {
    await resetMfa(db, user.id);
    console.log(`✓ ${email} sets up the authenticator app again on the next sign-in.`);
  }
} finally {
  await close();
}
