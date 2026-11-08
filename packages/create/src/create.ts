import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PROJECT_FILE, readIdentity, type StoreMode, setStoreMode } from "./project.ts";
import { type Identity, identityProblems, renameText } from "./rename.ts";

/** The lockfile is pnpm's: `pnpm install` brings it up to the new names. */
const NOT_RENAMED = new Set(["pnpm-lock.yaml"]);

export interface RenameReport {
  from: Identity;
  changed: string[];
}

/**
 * Renames the project in `dir` (a git checkout) to `to`: every tracked text file and the
 * project file itself, so the next rename starts from here.
 */
export function renameProject(dir: string, to: Identity): RenameReport {
  const problems = identityProblems(to);
  if (problems.length > 0) throw new Error(problems.join("\n"));
  const from = readIdentity(readFileSync(join(dir, PROJECT_FILE), "utf8"));
  if (!from) throw new Error(`${PROJECT_FILE} doesn't say the project's name, slug and domain`);
  const files = git(dir, ["ls-files", "-z"]).split("\0").filter(Boolean);
  const changed: string[] = [];
  for (const file of files) {
    if (NOT_RENAMED.has(file)) continue;
    const path = join(dir, file);
    // Links (.claude/skills → .agents/skills) and deleted files stay as they are.
    if (!existsSync(path) || !lstatSync(path).isFile()) continue;
    const bytes = readFileSync(path);
    if (bytes.includes(0)) continue; // binary: images, fonts
    const before = bytes.toString("utf8");
    const after = renameText(before, from, to);
    if (after !== before) {
      writeFileSync(path, after);
      changed.push(file);
    }
  }
  return { from, changed };
}

export interface CreateOptions {
  /** A git URL or a local path to the template. */
  template: string;
  /** Where the new project goes. */
  dir: string;
  identity: Identity;
  mode: StoreMode;
  install: boolean;
  log: (line: string) => void;
}

/**
 * A new project from the template: a fresh copy (its own git history, with the template as
 * the `template` remote for updates), renamed, in the store mode chosen, installed.
 */
export function createProject(options: CreateOptions): RenameReport {
  const { template, dir, identity, mode, log } = options;
  const problems = identityProblems(identity);
  if (problems.length > 0) throw new Error(problems.join("\n"));
  if (existsSync(dir)) throw new Error(`${dir} already exists: pick another name or folder`);

  log(`Copying the template from ${template}…`);
  const source = existsSync(template) ? `file://${resolve(template)}` : template;
  run("git", ["clone", "--quiet", "--depth", "1", source, dir]);
  const report = renameProject(dir, identity);
  for (const envFile of [".env.example"]) {
    const path = join(dir, envFile);
    if (existsSync(path)) writeFileSync(path, setStoreMode(readFileSync(path, "utf8"), mode));
  }
  log(`Renamed ${report.from.name} → ${identity.name} in ${report.changed.length} files.`);

  // Its own history from here; the template stays reachable to bring its updates.
  rmSync(join(dir, ".git"), { recursive: true, force: true });
  run("git", ["init", "--quiet", "--initial-branch", "main"], dir);
  run(
    "git",
    ["remote", "add", "template", existsSync(template) ? resolve(template) : template],
    dir,
  );
  if (options.install) {
    log("Installing dependencies (pnpm install)…");
    run("pnpm", ["install"], dir);
    // A new scope sorts imports differently: Biome puts them back in order.
    run("pnpm", ["format"], dir);
  }
  run("git", ["add", "--all"], dir);
  const commit = spawnSync(
    "git",
    [
      "commit",
      "--quiet",
      "--no-verify",
      "-m",
      `Start ${identity.name} from the ${report.from.name} template`,
    ],
    { cwd: dir, stdio: "ignore" },
  );
  if (commit.status === 0) {
    // The renamed template as it was copied: `pnpm template:update` merges the next ones.
    run("git", ["branch", "template"], dir);
  } else {
    log("Commit it yourself, then run git branch template: git has no user.name/user.email.");
  }
  return report;
}

function git(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}

function run(command: string, args: string[], cwd?: string): void {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
}

export interface UpdateOptions {
  /** The project to update. */
  dir: string;
  /** Branch, tag or commit of the template (default: its main). */
  ref: string;
  log: (line: string) => void;
}

/**
 * Brings the template's changes into a project made from it, without a conflict on every
 * renamed line: the template is copied, renamed to this project and committed on the
 * `template` branch (which holds only renamed template versions), and that branch is merged.
 * Git then only stops where the project changed the same lines as the template.
 */
export function updateFromTemplate({ dir, ref, log }: UpdateOptions): void {
  const to = readIdentity(readFileSync(join(dir, PROJECT_FILE), "utf8"));
  if (!to) throw new Error(`${PROJECT_FILE} doesn't say the project's name, slug and domain`);
  const remote = git(dir, ["remote", "get-url", "template"]).trim();
  if (git(dir, ["status", "--porcelain"]).trim()) {
    throw new Error("Commit or stash your changes first: the update ends in a merge");
  }
  const branches = git(dir, ["branch", "--list", "template"]).trim();
  if (!branches) throw new Error("No template branch: this project wasn't made with create");

  const work = mkdtempSync(join(tmpdir(), "template-"));
  const copy = join(work, "copy");
  const tree = join(work, "tree");
  try {
    log(`Copying ${ref} from ${remote}…`);
    const source = existsSync(remote) ? `file://${resolve(remote)}` : remote;
    run("git", ["clone", "--quiet", "--depth", "1", "--branch", ref, source, copy]);
    const version = git(copy, ["rev-parse", "--short", "HEAD"]).trim();
    renameProject(copy, to);
    // Same import order as the project, so formatting never shows up as a change.
    run(join(dir, "node_modules", ".bin", "biome"), ["check", "--write", "."], copy);
    rmSync(join(copy, ".git"), { recursive: true, force: true });

    run("git", ["worktree", "add", "--quiet", tree, "template"], dir);
    try {
      // The branch becomes exactly the renamed template: what it dropped goes away too.
      for (const file of git(tree, ["ls-files", "-z"]).split("\0").filter(Boolean)) {
        rmSync(join(tree, file), { force: true });
      }
      cpSync(copy, tree, { recursive: true, verbatimSymlinks: true });
      run("git", ["add", "--all"], tree);
      const pending = git(tree, ["status", "--porcelain"]).trim();
      if (!pending) {
        log("The project already has this version of the template.");
        return;
      }
      run("git", ["commit", "--quiet", "--no-verify", "-m", `Template ${version}`], tree);
    } finally {
      run("git", ["worktree", "remove", "--force", tree], dir);
    }
    log(`Merging template ${version}…`);
    const merged = spawnSync("git", ["merge", "--no-edit", "template"], {
      cwd: dir,
      stdio: "inherit",
    });
    if (merged.status !== 0) {
      throw new Error(
        "The template and this project changed the same lines: resolve the conflicts, " +
          "run pnpm install (it rewrites pnpm-lock.yaml) and commit",
      );
    }
    run("pnpm", ["install"], dir);
    // The template's lockfile still has its own names: pnpm just rewrote it for this project.
    if (git(dir, ["status", "--porcelain", "pnpm-lock.yaml"]).trim()) {
      run(
        "git",
        [
          "commit",
          "--quiet",
          "--no-verify",
          "-m",
          "Lockfile after the template update",
          "pnpm-lock.yaml",
        ],
        dir,
      );
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
