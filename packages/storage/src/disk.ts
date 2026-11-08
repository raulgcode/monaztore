import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { assertKey, type FileStore } from "./store";

/** Files in a folder on disk: the development fallback when R2 is not configured. */
export function diskFileStore(dir: string): FileStore {
  const root = resolve(dir);
  const path = (key: string) => {
    assertKey(key);
    return join(root, key);
  };

  return {
    kind: "disk",
    async put(key, body) {
      const file = path(key);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, body);
    },
    async get(key) {
      try {
        return await readFile(path(key));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async delete(key) {
      await rm(path(key), { force: true });
    },
  };
}

/**
 * `.data/files` at the monorepo's root, so the web app and the API (each started from its
 * own folder) share it.
 */
export function defaultFilesDir(cwd: string = process.cwd()): string {
  let dir = resolve(cwd);
  while (!existsSync(join(dir, "pnpm-workspace.yaml"))) {
    const parent = dirname(dir);
    if (parent === dir) return join(resolve(cwd), ".data", "files");
    dir = parent;
  }
  return join(dir, ".data", "files");
}
