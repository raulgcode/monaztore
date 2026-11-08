/**
 * `pnpm template:update [ref]`: brings the template's changes (its main, or a branch or tag)
 * into this project, renamed to it, as a merge. See `updateFromTemplate`.
 */
import { parseArgs } from "node:util";
import { updateFromTemplate } from "./create.ts";

const { positionals } = parseArgs({ allowPositionals: true });
try {
  updateFromTemplate({
    dir: process.cwd(),
    ref: positionals[0] ?? "main",
    log: (line) => console.log(line),
  });
  console.log("✓ Template merged. Run pnpm lint, pnpm typecheck and pnpm test before pushing.");
} catch (error) {
  console.error(`✗ ${(error as Error).message}`);
  process.exit(1);
}
