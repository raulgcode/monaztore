import { searchProducts } from "@monaztore/core";
import { tenantContext } from "~/context";
import type { Route } from "./+types/product-search";

/** Products by name or SKU, for pickers (a coupon's products). Read with `fetcher.load`. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return { products: await searchProducts(context.get(tenantContext), q) };
}
