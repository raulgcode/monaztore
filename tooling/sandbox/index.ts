/**
 * A store of your own to try things on, in your local database:
 *
 *   pnpm sandbox           creates it (or fills in what's missing) and prints where it is
 *   pnpm sandbox --reset   takes it away and creates it again from scratch
 *   pnpm sandbox --remove  takes it away
 *
 * The store answers on http://sandbox.localhost (no DNS to set up: browsers send `*.localhost`
 * to this machine); its panel is /app/sandbox, entered from /dev/sign-in as its owner. It
 * refuses to run against a database that isn't on this machine, or with NODE_ENV=production.
 */
import { parseArgs } from "node:util";
import { createDatabase } from "@monaztore/db";
import { loadDotEnv } from "@monaztore/env";
import { removeSandbox, sandbox, sandboxRefusal, seedSandbox } from "./seed";

const { values } = parseArgs({
  options: {
    reset: { type: "boolean", default: false },
    remove: { type: "boolean", default: false },
  },
});

loadDotEnv();
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("✗ DATABASE_URL is not set: run pnpm run setup first");
  process.exit(1);
}
const refusal = sandboxRefusal(databaseUrl, process.env.NODE_ENV);
if (refusal) {
  console.error(`✗ The sandbox only goes into a local database: ${refusal}`);
  process.exit(1);
}

const connection = createDatabase(databaseUrl);
try {
  if (values.reset || values.remove) {
    await removeSandbox(connection.db, sandbox);
    console.log(`Removed the ${sandbox.name} store.`);
  }
  if (!values.remove) {
    const { created } = await seedSandbox(connection.db, sandbox);
    const app = new URL(process.env.APP_URL ?? "http://localhost:5173");
    const port = app.port ? `:${app.port}` : "";
    console.log(`
✓ ${sandbox.name} is ${created ? "ready" : "up to date"}.

  Store   http://${sandbox.hostname}${port}
  Panel   ${app.origin}/dev/sign-in → ${sandbox.email} → /app/${sandbox.slug}

  With pnpm dev running. pnpm sandbox --reset starts it over.`);
  }
} finally {
  await connection.close();
}
