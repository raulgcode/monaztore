/**
 * `pnpm rename <slug> [--name "Super Chiva"] [--domain superchiva.cr]`: renames this project in
 * place (package scope, texts, databases, Fly apps, domain), then reinstalls and formats.
 * Renaming a project already in production also changes its Fly apps and database names.
 */

import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { renameProject } from "./create.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { name: { type: "string" }, domain: { type: "string" } },
});
const slug = positionals[0]?.toLowerCase();
if (!slug) {
  console.error('Usage: pnpm rename <slug> [--name "Super Chiva"] [--domain superchiva.cr]');
  process.exit(1);
}
try {
  const to = {
    slug,
    name: values.name ?? slug.charAt(0).toUpperCase() + slug.slice(1),
    domain: values.domain ?? `${slug}.com`,
  };
  const { from, changed } = renameProject(process.cwd(), to);
  console.log(`Renamed ${from.name} → ${to.name} in ${changed.length} files.`);
  for (const step of [["install"], ["format"]]) {
    if (spawnSync("pnpm", step, { stdio: "inherit" }).status !== 0) process.exit(1);
  }
} catch (error) {
  console.error(`✗ ${(error as Error).message}`);
  process.exit(1);
}
