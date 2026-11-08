import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { defaultFilesDir, diskFileStore } from "./disk";

const dir = await mkdtemp(join(tmpdir(), "monaztore-files-"));
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("diskFileStore", () => {
  it("keeps files under its folder", async () => {
    const store = diskFileStore(dir);
    await store.put("organizations/o1/logo.png", new Uint8Array([7, 8]), "image/png");
    expect([...(await readFile(join(dir, "organizations/o1/logo.png")))]).toEqual([7, 8]);
    expect([...((await store.get("organizations/o1/logo.png")) ?? [])]).toEqual([7, 8]);

    await store.delete("organizations/o1/logo.png");
    await store.delete("organizations/o1/logo.png");
    expect(await store.get("organizations/o1/logo.png")).toBeNull();
  });

  it("never leaves its folder", async () => {
    await expect(diskFileStore(dir).get("../../etc/passwd")).rejects.toThrow(/Invalid file key/);
  });
});

describe("defaultFilesDir", () => {
  it("is .data/files at the monorepo's root, from any package", () => {
    const root = defaultFilesDir();
    expect(root).toMatch(/\.data\/files$/);
    expect(defaultFilesDir(join(root, "../../apps/web"))).toBe(root);
  });
});
