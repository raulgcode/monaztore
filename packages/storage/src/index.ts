import { defaultFilesDir, diskFileStore } from "./disk";
import { type R2Credentials, r2FileStore } from "./r2";
import { cachedFileStore, type FileStore } from "./store";

export { defaultFilesDir, diskFileStore } from "./disk";
export { contentDisposition, type R2Credentials, r2FileStore } from "./r2";
export {
  assertKey,
  cachedFileStore,
  contentKey,
  type FileStore,
  memoryFileStore,
  type SignedUrlOptions,
} from "./store";

export interface FileStoreOptions {
  /** R2's bucket and token; without them the files go to `dir`. */
  r2?: R2Credentials;
  /** The folder for files without R2; `.data/files` at the repo's root by default. */
  dir?: string;
  /** How much of the most read files to keep in memory. 32 MB by default. */
  cacheBytes?: number;
}

/** The app's file store: R2 when configured, a folder on disk otherwise, with a memory cache. */
export function createFileStore({
  r2,
  dir,
  cacheBytes = 32 * 1024 * 1024,
}: FileStoreOptions = {}): FileStore {
  const store = r2 ? r2FileStore(r2) : diskFileStore(dir ?? defaultFilesDir());
  return cachedFileStore(store, { maxBytes: cacheBytes });
}
