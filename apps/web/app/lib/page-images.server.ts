import { saveStoreImage, type TenantContext } from "@monaztore/core";
import { webImage } from "@monaztore/storage/images";
import { files } from "./services.server";

/** A photo the store uploads (page editor, design): re-encoded as WebP and kept with the store's files. */
export async function uploadStoreImage(
  tenant: TenantContext,
  file: File,
  { maxSize }: { maxSize?: number } = {},
): Promise<string> {
  return saveStoreImage(
    tenant,
    { files, convert: (bytes) => webImage(bytes, { maxSize }) },
    new Uint8Array(await file.arrayBuffer()),
  );
}
