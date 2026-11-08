import { saveStoreImage, type TenantContext } from "@monaztore/core";
import { webImage } from "@monaztore/storage/images";
import { files } from "./services.server";

/** A photo uploaded in the page editor: re-encoded as WebP and kept with the store's files. */
export async function uploadStoreImage(tenant: TenantContext, file: File): Promise<string> {
  return saveStoreImage(
    tenant,
    { files, convert: (bytes) => webImage(bytes) },
    new Uint8Array(await file.arrayBuffer()),
  );
}
