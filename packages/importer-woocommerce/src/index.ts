import type { ImportedCatalog, ImportedCustomer, ImportedProduct } from "@monaztore/contracts";
import { WooCommerceClient, type WooCommerceConnection } from "./client";
import {
  mapStoreCategory,
  mapStoreProduct,
  mapV3Category,
  mapV3Customer,
  mapV3Product,
} from "./map";
import type { Store, V3 } from "./types";

export {
  type Fetch,
  WooCommerceClient,
  type WooCommerceConnection,
  WooCommerceError,
} from "./client";
export * from "./map";
export type { Store, V3 } from "./types";

export interface FetchCatalogOptions extends WooCommerceConnection {
  /** Overrides the currency read from the shop (ISO 4217, e.g. CRC). */
  currency?: string;
  /** Skip customers even when the keys allow reading them. */
  skipCustomers?: boolean;
  onProgress?: (message: string) => void;
}

export const SOURCE = "woocommerce";

/**
 * Reads a WooCommerce shop's catalog (categories, products with their variations, and with keys
 * also customers) and returns it in Monaztore's shape, ready for `importCatalog` in core. Reads
 * only: it never writes to the shop.
 */
export async function fetchWooCommerceCatalog(
  options: FetchCatalogOptions,
): Promise<ImportedCatalog> {
  const client = new WooCommerceClient(options);
  const log = options.onProgress ?? (() => {});
  return client.authenticated
    ? fetchWithKeys(client, options, log)
    : fetchPublic(client, options, log);
}

async function fetchWithKeys(
  client: WooCommerceClient,
  options: FetchCatalogOptions,
  log: (message: string) => void,
): Promise<ImportedCatalog> {
  const warnings: string[] = [];

  let currency = options.currency;
  if (!currency) {
    try {
      currency = (await client.get<{ code: string }>("wc/v3/data/currencies/current")).data.code;
    } catch {
      currency = "CRC";
      warnings.push("Couldn't read the shop's currency; assumed CRC.");
    }
  }
  let weightUnit = "kg";
  try {
    const { data } = await client.get<{ value: string }>(
      "wc/v3/settings/products/woocommerce_weight_unit",
    );
    weightUnit = data.value;
  } catch {
    // Settings need more than read access on some sites; kg is WooCommerce's default.
  }

  log("Reading categories…");
  const rawCategories = await client.all<V3.Category>("wc/v3/products/categories");
  // v3 categories don't carry their URL; WordPress's own taxonomy endpoint does.
  const links = new Map<number, string>();
  try {
    const terms = await client.all<{ id: number; link: string }>("wp/v2/product_cat", {
      _fields: "id,link",
    });
    for (const term of terms) links.set(term.id, term.link);
  } catch {
    warnings.push("Couldn't read category URLs: their old links won't redirect.");
  }
  const categories = rawCategories.map((category) =>
    mapV3Category(category, links.get(category.id)),
  );

  log("Reading products…");
  const rawProducts = await client.all<V3.Product>("wc/v3/products", { status: "any" });
  const products: ImportedProduct[] = [];
  for (const [index, product] of rawProducts.entries()) {
    if (product.type === "external" || product.type === "grouped") {
      warnings.push(
        `"${product.name}" is a ${product.type} product: brought as a draft without price.`,
      );
    }
    const variations =
      product.type === "variable" && product.variations.length > 0
        ? await client.all<V3.Variation>(`wc/v3/products/${product.id}/variations`)
        : [];
    const mapped = mapV3Product(product, variations, { weightUnit });
    products.push(
      product.type === "external" || product.type === "grouped"
        ? { ...mapped, status: "draft", price: null, compareAtPrice: null }
        : mapped,
    );
    if ((index + 1) % 25 === 0) log(`  ${index + 1}/${rawProducts.length} products`);
  }

  let customers: ImportedCustomer[] = [];
  if (!options.skipCustomers) {
    log("Reading customers…");
    try {
      const rawCustomers = await client.all<V3.Customer>("wc/v3/customers", { role: "all" });
      customers = rawCustomers.map(mapV3Customer).filter((c): c is ImportedCustomer => c !== null);
    } catch (error) {
      warnings.push(`Couldn't read customers: ${(error as Error).message}`);
    }
  }

  return {
    source: "woocommerce",
    sourceUrl: client.base.origin,
    currency,
    categories,
    products,
    customers,
    warnings,
  };
}

async function fetchPublic(
  client: WooCommerceClient,
  options: FetchCatalogOptions,
  log: (message: string) => void,
): Promise<ImportedCatalog> {
  const warnings = [
    "Imported without keys (public Store API): no drafts, stock counts, SEO fields or customers.",
  ];

  log("Reading categories…");
  const categories = (await client.all<Store.Category>("wc/store/v1/products/categories")).map(
    mapStoreCategory,
  );

  log("Reading products…");
  const rawProducts = await client.all<Store.Product>("wc/store/v1/products");
  const products: ImportedProduct[] = [];
  let currency = options.currency;
  for (const [index, product] of rawProducts.entries()) {
    currency ??= product.prices.currency_code;
    // A variation's price only comes when it is asked for on its own.
    const variations: Store.Product[] = [];
    for (const variation of product.variations) {
      variations.push(
        (await client.get<Store.Product>(`wc/store/v1/products/${variation.id}`)).data,
      );
    }
    products.push(mapStoreProduct(product, variations));
    if ((index + 1) % 25 === 0) log(`  ${index + 1}/${rawProducts.length} products`);
  }

  return {
    source: "woocommerce",
    sourceUrl: client.base.origin,
    currency: currency ?? "CRC",
    categories,
    products,
    customers: [],
    warnings,
  };
}
