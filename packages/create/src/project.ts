import type { Identity } from "./rename.ts";

/** Where a project says who it is (read by the app, rewritten by a rename). */
export const PROJECT_FILE = "packages/env/src/project.ts";

/** The identity in the text of `PROJECT_FILE`, or undefined when a field is missing. */
export function readIdentity(source: string): Identity | undefined {
  const field = (key: string) => source.match(new RegExp(`\\b${key}:\\s*"([^"]+)"`))?.[1];
  const name = field("name");
  const slug = field("slug");
  const domain = field("domain");
  return name && slug && domain ? { name, slug, domain } : undefined;
}

/** One store per instance (`single`) or many on their own domains (`multi`). */
export type StoreMode = "single" | "multi";

/** The env file with its `STORE_MODE=` line set to `mode`. */
export function setStoreMode(envFile: string, mode: StoreMode): string {
  return envFile.replace(/^STORE_MODE=.*$/m, `STORE_MODE=${mode}`);
}
