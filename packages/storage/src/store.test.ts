import { describe, expect, it, vi } from "vitest";
import { assertKey, cachedFileStore, contentKey, type FileStore, memoryFileStore } from "./store";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("contentKey", () => {
  it("names the file after its contents", () => {
    const key = contentKey("organizations/org-1/logos", bytes("png"), "png");
    expect(key).toMatch(/^organizations\/org-1\/logos\/[0-9a-f]{32}\.png$/);
    expect(contentKey("organizations/org-1/logos", bytes("png"), "png")).toBe(key);
    expect(contentKey("organizations/org-1/logos", bytes("other"), "png")).not.toBe(key);
  });
});

describe("assertKey", () => {
  it.each(["../secret", "a/../../b", "/absolute", "a//b", "a/", "Mayúsculas.png", "a\\b", ""])(
    "refuses %j",
    (key) => {
      expect(() => assertKey(key)).toThrow(/Invalid file key/);
    },
  );

  it("accepts lowercase path segments", () => {
    expect(() => assertKey("organizations/4f1c-9a/programs/p_1/logo.v2.png")).not.toThrow();
  });
});

describe("memoryFileStore", () => {
  it("keeps, reads and deletes files", async () => {
    const store = memoryFileStore();
    await store.put("a/b.png", bytes("one"), "image/png");
    expect((await store.get("a/b.png"))?.toString()).toBe("one");
    await store.delete("a/b.png");
    await store.delete("a/b.png");
    expect(await store.get("a/b.png")).toBeNull();
  });
});

describe("cachedFileStore", () => {
  function counted() {
    const inner = memoryFileStore();
    const get = vi.spyOn(inner, "get");
    return { inner, get };
  }

  it("reads each file from the store once", async () => {
    const { inner, get } = counted();
    await inner.put("a.png", bytes("one"), "image/png");
    const store = cachedFileStore(inner, { maxBytes: 100 });

    expect((await store.get("a.png"))?.toString()).toBe("one");
    expect((await store.get("a.png"))?.toString()).toBe("one");
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("drops the least recently read file past maxBytes", async () => {
    const { inner, get } = counted();
    const store: FileStore = cachedFileStore(inner, { maxBytes: 10 });
    await store.put("a.png", bytes("aaaa"), "image/png");
    await store.put("b.png", bytes("bbbb"), "image/png");
    await store.get("a.png"); // a is now the most recent
    await store.put("c.png", bytes("cccc"), "image/png"); // 12 bytes: b goes

    await store.get("a.png");
    await store.get("c.png");
    expect(get).not.toHaveBeenCalled();
    expect((await store.get("b.png"))?.toString()).toBe("bbbb");
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("forgets a deleted file", async () => {
    const store = cachedFileStore(memoryFileStore(), { maxBytes: 100 });
    await store.put("a.png", bytes("one"), "image/png");
    await store.delete("a.png");
    expect(await store.get("a.png")).toBeNull();
  });
});
