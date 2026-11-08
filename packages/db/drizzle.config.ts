import { databaseEnvSchema, loadDotEnv, parseEnv } from "@monaztore/env";
import { defineConfig } from "drizzle-kit";

loadDotEnv();
const env = parseEnv(databaseEnvSchema);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  casing: "snake_case",
  dbCredentials: { url: env.DATABASE_URL },
  strict: true,
  verbose: true,
});
