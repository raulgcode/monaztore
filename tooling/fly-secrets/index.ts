/**
 * Sends the production variables to both Fly apps:
 * `pnpm fly:secrets [.env.production] [--check]`.
 *
 * The file stays on this machine (`.env.*` is in .gitignore) and the values go straight to
 * Fly with `fly secrets set --stage`: they take effect with the next deploy (`pnpm release`).
 * First it checks the file and stops on anything that would break production (localhost,
 * Mailpit, the development BETTER_AUTH_SECRET); `--check` stops there.
 * Needs flyctl with a session (`fly auth login`).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { parseArgs, parseEnv } from "node:util";
import { planSecrets } from "./secrets";

const APPS = ["monaztore-api", "monaztore-web"];

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function readEnv(path: string): Record<string, string> {
  return parseEnv(readFileSync(path, "utf8")) as Record<string, string>;
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    check: { type: "boolean", default: false },
    yes: { type: "boolean", short: "y", default: false },
  },
});

const file = positionals[0] ?? ".env.production";
if (!existsSync(file)) {
  fail(
    `${file} doesn't exist: copy your .env (cp .env ${file}) and change what differs in production`,
  );
}
const local = existsSync(".env") && file !== ".env" ? readEnv(".env") : {};
const plan = planSecrets(readEnv(file), { localAuthSecret: local.BETTER_AUTH_SECRET });

console.log(`Secrets from ${file} for ${APPS.join(" and ")}:`);
for (const key of Object.keys(plan.secrets)) console.log(`  ✓ ${key}`);
for (const { key, reason } of plan.skipped) console.log(`  · ${key}: not sent (${reason})`);
if (plan.problems.length > 0) {
  console.error("\nBefore sending them, fix this:");
  for (const problem of plan.problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}
if (values.check) {
  console.log("\n✓ Ready for production");
  process.exit(0);
}

if (spawnSync("fly", ["auth", "whoami"], { stdio: "ignore" }).status !== 0) {
  fail("You need flyctl, signed in: brew install flyctl && fly auth login");
}
if (!values.yes) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question("\nSend them to Fly? (y/N) ");
  prompt.close();
  if (!/^(y|yes)$/i.test(answer.trim())) fail("Nothing was sent");
}

// As arguments, never through a shell: no value is quoted, expanded or printed.
const pairs = Object.entries(plan.secrets).map(([key, value]) => `${key}=${value}`);
for (const app of APPS) {
  const result = spawnSync("fly", ["secrets", "set", "--stage", "--app", app, ...pairs], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  if (result.status !== 0) fail(`Fly didn't accept the secrets for ${app}`);
  console.log(`✓ ${app}: ${pairs.length} secrets (they apply with the next deploy)`);
}
