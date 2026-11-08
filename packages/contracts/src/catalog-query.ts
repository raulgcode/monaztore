/**
 * What a shopper narrows the catalog to, as it lives in the URL so a filtered page can be shared,
 * bookmarked and reloaded: `?q=&sort=&min=&max=&stock=1&sale=1&f.Talla=M&f.Talla=L&page=`.
 * Prices in the URL are whole amounts of the currency (`min=5000` is ₡5 000); the query keeps
 * minor units, like the database.
 */

export const catalogSorts = ["newest", "price-asc", "price-desc", "name"] as const;
export type CatalogSort = (typeof catalogSorts)[number];

/** Option filters (`f.<name>`) a URL may carry, and values per option. */
export const CATALOG_OPTIONS_MAX = 8;
export const CATALOG_VALUES_MAX = 30;
const TEXT_MAX = 80;

export const OPTION_PARAM = "f.";

export interface CatalogQuery {
  q: string;
  sort: CatalogSort;
  /** Minor units. */
  minPrice: number | null;
  maxPrice: number | null;
  inStock: boolean;
  onSale: boolean;
  /** `{ Talla: ["M", "L"] }`: a product matches when it has any of the values of each option. */
  options: Record<string, string[]>;
  page: number;
}

export const emptyCatalogQuery: CatalogQuery = {
  q: "",
  sort: "newest",
  minPrice: null,
  maxPrice: null,
  inStock: false,
  onSale: false,
  options: {},
  page: 1,
};

function amount(value: string | null): number | null {
  if (!value?.trim()) return null;
  const number = Number(value.replace(/[\s,]/g, ""));
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(Math.min(number, 1e10) * 100);
}

/** The query in a URL's search params; anything odd falls back to "no filter". */
export function readCatalogQuery(params: URLSearchParams): CatalogQuery {
  const sort = params.get("sort");
  const page = Number.parseInt(params.get("page") ?? "", 10);
  let minPrice = amount(params.get("min"));
  let maxPrice = amount(params.get("max"));
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }
  const options: Record<string, string[]> = {};
  for (const [key, value] of params) {
    if (!key.startsWith(OPTION_PARAM)) continue;
    const name = key.slice(OPTION_PARAM.length).trim().slice(0, TEXT_MAX);
    const text = value.trim().slice(0, TEXT_MAX);
    if (!name || !text) continue;
    if (!(name in options) && Object.keys(options).length >= CATALOG_OPTIONS_MAX) continue;
    const values = options[name] ?? [];
    options[name] = values;
    if (!values.includes(text) && values.length < CATALOG_VALUES_MAX) values.push(text);
  }
  return {
    q: (params.get("q") ?? "").trim().slice(0, 200),
    sort: catalogSorts.includes(sort as CatalogSort) ? (sort as CatalogSort) : "newest",
    minPrice,
    maxPrice,
    inStock: params.get("stock") === "1",
    onSale: params.get("sale") === "1",
    options,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** The query back as search params, leaving out what is the default. */
export function catalogParams(query: Partial<CatalogQuery>): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.sort && query.sort !== "newest") params.set("sort", query.sort);
  if (query.minPrice != null) params.set("min", String(query.minPrice / 100));
  if (query.maxPrice != null) params.set("max", String(query.maxPrice / 100));
  if (query.inStock) params.set("stock", "1");
  if (query.onSale) params.set("sale", "1");
  for (const [name, values] of Object.entries(query.options ?? {})) {
    for (const value of values) params.append(`${OPTION_PARAM}${name}`, value);
  }
  if (query.page && query.page > 1) params.set("page", String(query.page));
  return params;
}

/** How many filters narrow the list (search and order don't count). */
export function activeFilterCount(query: CatalogQuery): number {
  return (
    (query.minPrice !== null || query.maxPrice !== null ? 1 : 0) +
    (query.inStock ? 1 : 0) +
    (query.onSale ? 1 : 0) +
    Object.values(query.options).reduce((total, values) => total + values.length, 0)
  );
}

/** One filter taken away, for the "×" on its chip. Going back to page 1. */
export function withoutFilter(
  query: CatalogQuery,
  filter:
    | { kind: "price" }
    | { kind: "stock" }
    | { kind: "sale" }
    | { kind: "option"; name: string; value: string },
): CatalogQuery {
  const next: CatalogQuery = { ...query, options: { ...query.options }, page: 1 };
  if (filter.kind === "price") {
    next.minPrice = null;
    next.maxPrice = null;
  } else if (filter.kind === "stock") next.inStock = false;
  else if (filter.kind === "sale") next.onSale = false;
  else {
    const values = (next.options[filter.name] ?? []).filter((v) => v !== filter.value);
    if (values.length > 0) next.options[filter.name] = values;
    else delete next.options[filter.name];
  }
  return next;
}
