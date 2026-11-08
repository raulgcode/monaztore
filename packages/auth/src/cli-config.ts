// Entry point for the Better Auth CLI (`pnpm auth:generate`), which reads `auth` to generate the
// Drizzle schema in packages/db/src/schema/auth.ts. Every method is on, so the schema has all
// their tables and columns whatever AUTH_METHODS says.
import { createDatabase } from "@monaztore/db";
import { createMailer } from "@monaztore/email";
import { authMethods, getServerEnv } from "@monaztore/env";
import { createAuth } from "./auth";

const env = getServerEnv();

export const auth = createAuth({
  db: createDatabase(env.DATABASE_URL).db,
  mailer: createMailer(env),
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  methods: authMethods,
  google: { clientId: "schema", clientSecret: "schema" },
});
