import { data } from "react-router";
import { tenantContext } from "~/context";
import { uploadStoreImage } from "~/lib/page-images.server";
import type { Route } from "./+types/product-images";

/** A product photo, from the editor: re-encoded as WebP among the store's files. */
export async function action({ request, context }: Route.ActionArgs) {
  const tenant = context.get(tenantContext);
  const formData = await request.formData();
  const file = formData.get("file");
  const slot = String(formData.get("slot") ?? "");
  if (!(file instanceof File) || file.size === 0 || !file.type.startsWith("image/")) {
    return data({ slot, url: null }, { status: 400 });
  }
  try {
    return { slot, url: await uploadStoreImage(tenant, file, { maxSize: 1600 }) };
  } catch {
    return data({ slot, url: null }, { status: 400 });
  }
}
