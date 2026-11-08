/**
 * Runs the Playwright scenarios on GitHub Actions instead of this machine:
 * `pnpm e2e:remote [branch] [--project desktop|mobile] [--grep "text"] [--no-watch]`.
 *
 * Without a branch it uses the current one, which must already be pushed: the run tests what is
 * on GitHub, not local changes. It waits for the run and exits with its result; on failure it
 * prints the failed steps and how to download the report. Needs the GitHub CLI (`gh auth login`).
 */
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

function run(command: string, args: string[]): number {
  return spawnSync(command, args, { stdio: "inherit" }).status ?? 1;
}

/** Runs a command quietly and returns its trimmed stdout, or undefined when it fails. */
function capture(command: string, args: string[]): string | undefined {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    project: { type: "string", default: "all" },
    grep: { type: "string" },
    "no-watch": { type: "boolean", default: false },
  },
});

const WORKFLOW = "e2e.yml";
const suite = "E2E";

if (!["all", "desktop", "mobile"].includes(values.project)) {
  fail(`--project must be all, desktop or mobile (got "${values.project}")`);
}
if (!capture("gh", ["auth", "status"])) {
  fail("You need the GitHub CLI, signed in: brew install gh && gh auth login");
}

const branch = positionals[0] ?? capture("git", ["branch", "--show-current"]);
if (!branch) fail("No current branch: pass one, e.g. pnpm e2e:remote main");

const remote = capture("git", ["ls-remote", "--heads", "origin", branch])?.split(/\s/)[0];
if (!remote) fail(`Branch ${branch} isn't on GitHub: git push it first`);
if (!positionals[0]) {
  const local = capture("git", ["rev-parse", "HEAD"]);
  const dirty = capture("git", ["status", "--porcelain"]);
  if (local !== remote) {
    console.warn(`⚠ Your ${branch} differs from origin: testing ${remote.slice(0, 7)}.`);
  }
  if (dirty) console.warn("⚠ There are uncommitted changes: they are not part of the run.");
}

const startedAt = new Date();
const dispatch = ["workflow", "run", WORKFLOW, "--ref", branch, "-f", `project=${values.project}`];
if (values.grep) dispatch.push("-f", `grep=${values.grep}`);
if (run("gh", dispatch) !== 0) fail("GitHub didn't accept the run");

// The dispatch doesn't return the run: look for it among the newest of this branch.
let runId: string | undefined;
for (let attempt = 0; attempt < 15 && !runId; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const list = capture("gh", [
    "run",
    "list",
    "--workflow",
    WORKFLOW,
    "--branch",
    branch,
    "--event",
    "workflow_dispatch",
    "--limit",
    "5",
    "--json",
    "databaseId,createdAt,url",
  ]);
  const runs: { databaseId: number; createdAt: string; url: string }[] = JSON.parse(list ?? "[]");
  const found = runs.find((r) => new Date(r.createdAt).getTime() >= startedAt.getTime() - 5000);
  if (found) {
    runId = String(found.databaseId);
    console.log(`▸ ${suite} on ${branch}: ${found.url}`);
  }
}
if (!runId) fail("Couldn't find the run: look for it in GitHub's Actions tab");
if (values["no-watch"]) process.exit(0);

const status = run("gh", ["run", "watch", runId, "--exit-status", "--interval", "15"]);
if (status === 0) {
  console.log(`✓ Every ${suite} test passed`);
} else {
  // The tail of the failed jobs' log is where Playwright lists what failed.
  const log = capture("gh", ["run", "view", runId, "--log-failed"]) ?? "";
  console.error(log.split("\n").slice(-80).join("\n"));
  console.error(`\n✗ ${suite} tests failed. Report: gh run download ${runId}`);
}
process.exit(status);
