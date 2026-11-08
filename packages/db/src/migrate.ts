import { fileURLToPath } from "node:url";
import { databaseEnvSchema, loadDotEnv, parseEnv } from "@monaztore/env";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "./client";

export const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

export async function runMigrations(connectionString: string): Promise<void> {
  const connection = createDatabase(connectionString);
  try {
    await migrate(connection.db, { migrationsFolder });
  } finally {
    await connection.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadDotEnv();
  const env = parseEnv(databaseEnvSchema);
  await runMigrations(env.DATABASE_URL);
  console.log("Migrations applied");
}
