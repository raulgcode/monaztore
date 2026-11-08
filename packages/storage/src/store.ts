import { createHash } from "node:crypto";

/**
 * Where the files people upload live: Cloudflare R2 in production, a folder on disk in
 * development. Postgres keeps only the key.
 */
export interface FileStore {
  /** Which backend this is, for the startup log. */
  readonly kind: "r2" | "disk" | "memory";
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** The file's bytes, or null when there is no file under that key. */
  get(key: string): Promise<Buffer | null>;
  /** Removes the file; a missing one is not an error. */
  delete(key: string): Promise<void>;
  /**
   * A URL that downloads the file straight from the store for a few minutes, saved as
   * `fileName`, so a big file never goes through our server. Only R2 has one: without it the
   * app reads the file with `get` and serves it.
   */
  signedUrl?(key: string, options: SignedUrlOptions): Promise<string>;
}

export interface SignedUrlOptions {
  /** How long the URL works. */
  expiresInSeconds: number;
  /** The name the browser saves it with. */
  fileName: string;
}

/** Lowercase path segments of letters, digits, dots, dashes and underscores; never `..`. */
const keyPattern = /^[a-z0-9_-][a-z0-9._-]*(\/[a-z0-9_-][a-z0-9._-]*)*$/;

/** Throws on a key that could climb out of its folder or that R2 and disks spell differently. */
export function assertKey(key: string): void {
  if (!keyPattern.test(key) || key.length > 512) throw new Error(`Invalid file key: ${key}`);
}

/**
 * A key named after the file's contents: a new upload gets a new key, so a stored file never
 * changes and can be cached forever.
 */
export function contentKey(prefix: string, body: Uint8Array, extension: string): string {
  const hash = createHash("sha256").update(body).digest("hex").slice(0, 32);
  const key = `${prefix}/${hash}.${extension}`;
  assertKey(key);
  return key;
}

/** Files kept in memory: for tests. */
export function memoryFileStore(): FileStore & { keys(): string[] } {
  const files = new Map<string, Buffer>();
  return {
    kind: "memory",
    async put(key, body) {
      assertKey(key);
      files.set(key, Buffer.from(body));
    },
    async get(key) {
      assertKey(key);
      return files.get(key) ?? null;
    },
    async delete(key) {
      assertKey(key);
      files.delete(key);
    },
    keys: () => [...files.keys()],
  };
}

/**
 * Keeps recently read files in memory, up to `maxBytes`, dropping the least recently used.
 * Only for content keys (`contentKey`): a key's bytes never change.
 */
export function cachedFileStore(store: FileStore, { maxBytes }: { maxBytes: number }): FileStore {
  const cache = new Map<string, Buffer>();
  let size = 0;
  const forget = (key: string) => {
    const cached = cache.get(key);
    if (!cached) return;
    cache.delete(key);
    size -= cached.byteLength;
  };
  const remember = (key: string, body: Buffer) => {
    if (body.byteLength > maxBytes) return;
    forget(key);
    cache.set(key, body);
    size += body.byteLength;
    for (const oldest of cache.keys()) {
      if (size <= maxBytes) break;
      forget(oldest);
    }
  };

  return {
    kind: store.kind,
    async put(key, body, contentType) {
      await store.put(key, body, contentType);
      remember(key, Buffer.from(body));
    },
    async get(key) {
      const cached = cache.get(key);
      if (cached) {
        // Map order is insertion order: move it to the newest end.
        cache.delete(key);
        cache.set(key, cached);
        return cached;
      }
      const body = await store.get(key);
      if (body) remember(key, body);
      return body;
    },
    async delete(key) {
      forget(key);
      await store.delete(key);
    },
    ...(store.signedUrl ? { signedUrl: store.signedUrl.bind(store) } : {}),
  };
}
