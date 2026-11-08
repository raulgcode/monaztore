#!/usr/bin/env node
/**
 * `pnpm create monaztore <slug> [--name "Super Chiva"] [--domain superchiva.cr] [--single]`
 *
 * A new store project from the template: its own repo, with its own name, package scope,
 * databases, Fly apps and domain, ready for `pnpm run setup`. `--single` makes it a standalone
 * store (one store per instance); without it, it's multistore (many stores on their own
 * domains). `--template <git url or path>` copies another template (default: Monaztore's repo).
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { createProject } from "./create.ts";

const TEMPLATE = "https://github.com/raulgcode/monaztore.git";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    name: { type: "string" },
    domain: { type: "string" },
    single: { type: "boolean", default: false },
    template: { type: "string", default: TEMPLATE },
    dir: { type: "string" },
    "skip-install": { type: "boolean", default: false },
  },
});

const slug = positionals[0]?.toLowerCase();
if (!slug) {
  console.error(
    'Usage: pnpm create monaztore <name> [--name "Super Chiva"] [--domain superchiva.cr] [--single]',
  );
  process.exit(1);
}
const identity = {
  slug,
  name: values.name ?? slug.charAt(0).toUpperCase() + slug.slice(1),
  domain: values.domain ?? `${slug}.com`,
};

try {
  // From inside the template (`pnpm new`), next to it rather than inside it.
  const fromHere = existsSync(values.template) && resolve(values.template) === process.cwd();
  const dir = resolve(values.dir ?? (fromHere ? `../${slug}` : slug));
  createProject({
    template: values.template,
    dir,
    identity,
    mode: values.single ? "single" : "multi",
    install: !values["skip-install"],
    log: (line) => console.log(line),
  });
  console.log(`
✓ ${identity.name} is ready in ${dir} (${values.single ? "one store" : "multistore"}).

  cd ${dir}
  pnpm run setup     # .env, secrets, Postgres, migrations
  pnpm dev

Template updates: pnpm template:update`);
} catch (error) {
  console.error(`✗ ${(error as Error).message}`);
  process.exit(1);
}
