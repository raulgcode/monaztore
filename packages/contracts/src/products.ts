import { z } from "zod/mini";
import { priceToMinor } from "./digital-products";
import { message } from "./message";
import { pageSlugOf, pageSlugPattern } from "./pages";

// The workspace's product editor: one form with everything a product has (photos, prices and
// offers, stock, attributes and variants, collections, SEO). The structured parts (photos,
// attributes, variants) travel as JSON in hidden fields, like the page editor's blocks.

export const productStatuses = ["active", "draft", "archived"] as const;
export type ProductStatus = (typeof productStatuses)[number];

export const PRODUCT_IMAGES_MAX = 20;
export const PRODUCT_ATTRIBUTES_MAX = 10;
/** Attributes the shopper picks from: 3 × 10 values already makes 1000 combinations. */
export const VARIATION_ATTRIBUTES_MAX = 3;
export const ATTRIBUTE_VALUES_MAX = 50;
export const PRODUCT_VARIANTS_MAX = 100;
/** Products the list shows at a time. */
export const ADMIN_PRODUCTS_PAGE_SIZE = 25;
/** Products a bulk action takes at once (one page, all selected). */
export const BULK_PRODUCTS_MAX = 100;

// ── Offers ───────────────────────────────────────────────────────────────────────────────────

/** When an offer runs: either end open (null). */
export interface SaleWindow {
  saleStartsAt: Date | null;
  saleEndsAt: Date | null;
}

/** The offer's dates include `now`: started (or no start) and not ended (or no end). */
export function saleIsOn(window: SaleWindow, now: Date): boolean {
  return (
    (window.saleStartsAt === null || window.saleStartsAt.getTime() <= now.getTime()) &&
    (window.saleEndsAt === null || window.saleEndsAt.getTime() > now.getTime())
  );
}

/**
 * What something costs right now. A price under `compareAtPrice` is an offer: outside its dates
 * the regular price (`compareAtPrice`) applies and nothing shows crossed out.
 */
export function currentPrice(
  prices: { price: number | null; compareAtPrice: number | null },
  window: SaleWindow,
  now: Date,
): { price: number | null; compareAtPrice: number | null } {
  const { price, compareAtPrice } = prices;
  const offer = price !== null && compareAtPrice !== null && compareAtPrice > price;
  if (!offer) return { price, compareAtPrice: null };
  return saleIsOn(window, now)
    ? { price, compareAtPrice }
    : { price: compareAtPrice, compareAtPrice: null };
}

/** The form's "Price" and "Offer price" → what the database keeps (`price` is what it costs). */
export function pricesOf(
  regular: number | null,
  offer: number | null,
): { price: number | null; compareAtPrice: number | null } {
  if (regular === null) return { price: offer, compareAtPrice: null };
  if (offer === null || offer >= regular) return { price: regular, compareAtPrice: null };
  return { price: offer, compareAtPrice: regular };
}

/** The other way round, to fill the form again. */
export function formPricesOf(price: number | null, compareAtPrice: number | null) {
  if (price !== null && compareAtPrice !== null && compareAtPrice > price) {
    return { regular: compareAtPrice, offer: price };
  }
  return { regular: price, offer: null };
}

/** How much an offer takes off, in whole percent: 10000 → 7500 is 25. */
export function percentOff(regular: number, offer: number): number {
  return regular > 0 ? Math.round(((regular - offer) / regular) * 100) : 0;
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The UTC offset (ms) of a time zone at an instant: Costa Rica is −6 h. */
function zoneOffset(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const local = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return local - instant;
}

/** A valid IANA time zone, or Costa Rica's. */
export function safeTimeZone(timeZone: string | null | undefined): string {
  try {
    if (timeZone) {
      new Intl.DateTimeFormat("en-US", { timeZone });
      return timeZone;
    }
  } catch {}
  return "America/Costa_Rica";
}

/**
 * The midnight that starts a day (`2026-11-20`) in a time zone, as an instant. `endOfDay` gives
 * the next midnight instead, so an offer "until the 20th" includes all of the 20th.
 */
export function dayStart(day: string, timeZone: string, { endOfDay = false } = {}): Date | null {
  const match = DAY.exec(day);
  if (!match) return null;
  const guess = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]) + (endOfDay ? 1 : 0),
  );
  if (Number.isNaN(guess)) return null;
  const zone = safeTimeZone(timeZone);
  const first = guess - zoneOffset(guess, zone);
  return new Date(guess - zoneOffset(first, zone));
}

/** The day an instant falls on in a time zone, as the date field shows it (`2026-11-20`). */
export function dayOf(instant: Date, timeZone: string, { endOfDay = false } = {}): string {
  const at = new Date(instant.getTime() - (endOfDay ? 1 : 0));
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

// ── Attributes and variants ──────────────────────────────────────────────────────────────────

export interface ProductAttribute {
  name: string;
  values: string[];
  /** The shopper picks one of its values: it makes the variants. */
  variation: boolean;
}

/** `{ Talla: "M", Color: "Rojo" }` → `"Color=Rojo|Talla=M"`: the same combination, any order. */
export function variantKey(options: Record<string, string>): string {
  return Object.entries(options)
    .map(([name, value]) => `${name}=${value}`)
    .sort()
    .join("|");
}

/** Every combination of the attributes the shopper picks: Talla S, M × Color Rojo, Azul → 4. */
export function variantCombinations(
  attributes: readonly ProductAttribute[],
): Record<string, string>[] {
  const picked = attributes.filter(
    (attribute) => attribute.variation && attribute.values.length > 0,
  );
  if (picked.length === 0) return [];
  let combinations: Record<string, string>[] = [{}];
  for (const attribute of picked) {
    combinations = combinations.flatMap((combination) =>
      attribute.values.map((value) => ({ ...combination, [attribute.name]: value })),
    );
  }
  return combinations;
}

/** "S, M,  L,M" → ["S", "M", "L"]: what people type in a values field. */
export function attributeValuesOf(text: string): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const raw of text.split(/[,\n|]/)) {
    const value = raw.trim().replace(/\s+/g, " ").slice(0, 60);
    if (value && !seen.has(value.toLowerCase())) {
      seen.add(value.toLowerCase());
      values.push(value);
    }
  }
  return values;
}

/** A variant as the editor sends it: its prices as typed, its stock as a number or empty. */
export interface VariantDraft {
  /** The saved variant this row is (orders and carts keep pointing to it); absent when new. */
  id?: string;
  options: Record<string, string>;
  sku: string;
  price: string;
  offerPrice: string;
  stock: string;
  inStock: boolean;
  imageUrl: string;
}

const optionalPrice = (value: string) => (value.trim() === "" ? null : priceToMinor(value));
const stockOf = (value: string) => (/^\d{1,6}$/.test(value.trim()) ? Number(value.trim()) : null);

export const emptyVariant = (options: Record<string, string>): VariantDraft => ({
  options,
  sku: "",
  price: "",
  offerPrice: "",
  stock: "",
  inStock: true,
  imageUrl: "",
});

/**
 * The variants that go with new attributes. When the attributes the shopper picks are the
 * same ones (by name), the variants the owner took out stay out and only new values add rows;
 * when they change, every combination comes, keeping what was typed for the ones that remain.
 */
export function syncVariants(
  before: readonly ProductAttribute[],
  after: readonly ProductAttribute[],
  variants: readonly VariantDraft[],
): VariantDraft[] {
  const names = (list: readonly ProductAttribute[]) =>
    list
      .filter((a) => a.variation && a.values.length > 0)
      .map((a) => a.name)
      .sort()
      .join("|");
  const combinations = variantCombinations(after);
  const byKey = new Map(variants.map((variant) => [variantKey(variant.options), variant]));
  if (names(before) !== names(after)) {
    return combinations.map((options) => byKey.get(variantKey(options)) ?? emptyVariant(options));
  }
  const valid = (options: Record<string, string>) =>
    Object.entries(options).every(([name, value]) =>
      after.some((a) => a.variation && a.name === name && a.values.includes(value)),
    );
  const oldValues = new Map(before.map((a) => [a.name, new Set(a.values)]));
  const kept = variants.filter((variant) => valid(variant.options));
  const added = combinations.filter(
    (options) =>
      !byKey.has(variantKey(options)) &&
      Object.entries(options).some(([name, value]) => !oldValues.get(name)?.has(value)),
  );
  return [...kept, ...added.map(emptyVariant)];
}

/** A price field that may stay empty: empty, or a valid price. */
export const priceIsValid = (value: string) =>
  value.trim() === "" || (priceToMinor(value) ?? 0) > 0;
export const stockIsValid = (value: string) => value.trim() === "" || stockOf(value) !== null;

/** A store image: `/media/…`, or the address an imported photo still has. */
const imageUrl = z.string().check(
  z.maxLength(500),
  z.refine((value) => value.startsWith("/media/") || /^https:\/\//i.test(value)),
);

const imagesJson = z
  .array(z.object({ url: imageUrl, alt: z.string().check(z.maxLength(200)) }))
  .check(z.maxLength(PRODUCT_IMAGES_MAX));

const attributesJson = z
  .array(
    z.object({
      name: z.string().check(z.trim(), z.minLength(1), z.maxLength(60)),
      values: z
        .array(z.string().check(z.trim(), z.minLength(1), z.maxLength(60)))
        .check(z.minLength(1), z.maxLength(ATTRIBUTE_VALUES_MAX)),
      variation: z.boolean(),
    }),
  )
  .check(
    z.maxLength(PRODUCT_ATTRIBUTES_MAX),
    z.refine((list) => new Set(list.map((a) => a.name.toLowerCase())).size === list.length),
    z.refine((list) => list.filter((a) => a.variation).length <= VARIATION_ATTRIBUTES_MAX),
  );

const variantsJson = z
  .array(
    z.object({
      id: z.optional(z.uuid()),
      options: z.record(z.string().check(z.maxLength(60)), z.string().check(z.maxLength(60))),
      sku: z.string().check(z.trim(), z.maxLength(64)),
      price: z.string().check(z.maxLength(20), z.refine(priceIsValid)),
      offerPrice: z.string().check(z.maxLength(20), z.refine(priceIsValid)),
      stock: z.string().check(z.maxLength(7), z.refine(stockIsValid)),
      inStock: z.boolean(),
      imageUrl: z.union([z.literal(""), imageUrl]),
    }),
  )
  .check(z.maxLength(PRODUCT_VARIANTS_MAX));

/** A hidden field holding JSON for `schema`; anything off is one error (`key`) on that field. */
function json<T>(schema: z.ZodMiniType<T>, key: Parameters<typeof message>[0], empty: string) {
  return z.pipe(
    z._default(z.string(), empty),
    z.transform((value, ctx): T => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        parsed = undefined;
      }
      const result = schema.safeParse(parsed);
      if (!result.success) {
        ctx.issues.push({ code: "custom", input: value, message: message(key) });
        return JSON.parse(empty) as T;
      }
      return result.data;
    }),
  );
}

const optionalText = (max: number) =>
  z._default(z.string().check(z.trim(), z.maxLength(max, message("forms.textTooLong"))), "");

const priceField = z._default(
  z.string().check(z.trim(), z.refine(priceIsValid, message("forms.priceInvalid"))),
  "",
);

const dayField = z._default(
  z.string().check(
    z.trim(),
    z.refine((value) => value === "" || DAY.test(value), message("forms.dateInvalid")),
  ),
  "",
);

const checkbox = z.pipe(
  z._default(z.string(), ""),
  z.transform((value) => value === "on" || value === "true"),
);

/** Everything the product editor sends. */
export const productFormSchema = z
  .object({
    name: z
      .string({ error: message("forms.productNameRequired") })
      .check(
        z.trim(),
        z.minLength(1, message("forms.productNameRequired")),
        z.maxLength(200, message("forms.textTooLong")),
      ),
    slug: z._default(
      z.string().check(
        z.trim(),
        z.toLowerCase(),
        z.maxLength(120, message("forms.textTooLong")),
        z.refine(
          (slug) => slug === "" || pageSlugPattern.test(slug),
          message("forms.pageSlugInvalid"),
        ),
      ),
      "",
    ),
    status: z._default(z.enum(productStatuses), "draft"),
    description: z._default(
      z.string().check(z.maxLength(50_000, message("forms.textTooLong"))),
      "",
    ),
    shortDescription: optionalText(1000),
    regularPrice: priceField,
    offerPrice: priceField,
    saleFrom: dayField,
    saleTo: dayField,
    /** The browser's time zone, so "until the 20th" is the 20th where the owner lives. */
    timeZone: z._default(z.string().check(z.maxLength(64)), ""),
    sku: optionalText(64),
    trackStock: checkbox,
    stock: z._default(
      z.string().check(z.trim(), z.refine(stockIsValid, message("forms.stockInvalid"))),
      "",
    ),
    available: z._default(z.enum(["yes", "no"]), "yes"),
    weight: z._default(
      z.string().check(
        z.trim(),
        z.refine(
          (value) => value === "" || /^\d{1,6}$/.test(value),
          message("forms.weightInvalid"),
        ),
      ),
      "",
    ),
    seoTitle: optionalText(70),
    seoDescription: optionalText(160),
    categoryIds: z._default(z.array(z.uuid()), []),
    images: json(imagesJson, "forms.imagesInvalid", "[]"),
    attributes: json(attributesJson, "forms.attributesInvalid", "[]"),
    variants: json(variantsJson, "forms.variantsInvalid", "[]"),
  })
  .check(
    z.refine(
      (form) => {
        const regular = optionalPrice(form.regularPrice);
        const offer = optionalPrice(form.offerPrice);
        return regular === null || offer === null || offer < regular;
      },
      { message: message("forms.offerNotLower"), path: ["offerPrice"] },
    ),
    z.refine((form) => form.saleFrom === "" || form.saleTo === "" || form.saleFrom <= form.saleTo, {
      message: message("forms.saleDatesOrder"),
      path: ["saleTo"],
    }),
    z.refine(
      (form) =>
        form.status !== "active" ||
        form.variants.length > 0 ||
        form.regularPrice !== "" ||
        form.offerPrice !== "",
      {
        message: message("forms.priceRequired"),
        path: ["regularPrice"],
      },
    ),
  );
export type ProductForm = z.infer<typeof productFormSchema>;

/** What core saves: the form with its prices in minor units, dates as instants. Pure. */
export function productInputOf(form: ProductForm): ProductInput {
  const zone = safeTimeZone(form.timeZone);
  const prices = pricesOf(optionalPrice(form.regularPrice), optionalPrice(form.offerPrice));
  const hasVariants = form.variants.length > 0;
  return {
    name: form.name,
    slug: form.slug || pageSlugOf(form.name),
    status: form.status,
    description: form.description,
    shortDescription: form.shortDescription,
    sku: form.sku || null,
    ...prices,
    saleStartsAt: form.saleFrom ? dayStart(form.saleFrom, zone) : null,
    saleEndsAt: form.saleTo ? dayStart(form.saleTo, zone, { endOfDay: true }) : null,
    stockQuantity: form.trackStock && !hasVariants ? (stockOf(form.stock) ?? 0) : null,
    inStock:
      form.trackStock && !hasVariants ? (stockOf(form.stock) ?? 0) > 0 : form.available === "yes",
    weightGrams: form.weight ? Number(form.weight) : null,
    seoTitle: form.seoTitle || null,
    seoDescription: form.seoDescription || null,
    categoryIds: [...new Set(form.categoryIds)],
    images: form.images,
    attributes: form.attributes,
    variants: form.variants.map((variant) => {
      const variantPrices = pricesOf(
        optionalPrice(variant.price),
        optionalPrice(variant.offerPrice),
      );
      const stock = form.trackStock ? (stockOf(variant.stock) ?? 0) : null;
      return {
        id: variant.id,
        options: variant.options,
        sku: variant.sku || null,
        ...variantPrices,
        stockQuantity: stock,
        inStock: stock === null ? variant.inStock : stock > 0,
        imageUrl: variant.imageUrl || null,
      };
    }),
  };
}
export interface ProductVariantInput {
  id?: string | undefined;
  options: Record<string, string>;
  sku: string | null;
  price: number | null;
  compareAtPrice: number | null;
  stockQuantity: number | null;
  inStock: boolean;
  imageUrl: string | null;
}

export interface ProductInput {
  name: string;
  slug: string;
  status: ProductStatus;
  description: string;
  shortDescription: string;
  sku: string | null;
  price: number | null;
  compareAtPrice: number | null;
  saleStartsAt: Date | null;
  saleEndsAt: Date | null;
  stockQuantity: number | null;
  inStock: boolean;
  weightGrams: number | null;
  seoTitle: string | null;
  seoDescription: string | null;
  categoryIds: string[];
  images: ProductForm["images"];
  attributes: ProductForm["attributes"];
  variants: ProductVariantInput[];
}

// ── The list ─────────────────────────────────────────────────────────────────────────────────

export const productListStatuses = ["all", ...productStatuses] as const;
export const productStockFilters = ["all", "in", "out", "low"] as const;
export const productSorts = ["newest", "name", "price-asc", "price-desc", "stock"] as const;

/** Few enough left to warn: "low stock". */
export const LOW_STOCK = 5;

export interface ProductListQuery {
  q: string;
  status: (typeof productListStatuses)[number];
  stock: (typeof productStockFilters)[number];
  /** A collection's id, or "" for all. */
  category: string;
  sort: (typeof productSorts)[number];
  page: number;
}

const pick = <T extends string>(value: string | null, options: readonly T[], fallback: T): T =>
  value !== null && (options as readonly string[]).includes(value) ? (value as T) : fallback;

/** The list's state, from its URL (`?q=&status=&stock=&category=&sort=&page=`). Pure. */
export function readProductListQuery(params: URLSearchParams): ProductListQuery {
  const page = Number(params.get("page"));
  const category = params.get("category") ?? "";
  return {
    q: (params.get("q") ?? "").trim().slice(0, 100),
    status: pick(params.get("status"), productListStatuses, "all"),
    stock: pick(params.get("stock"), productStockFilters, "all"),
    category: /^[0-9a-f-]{36}$/i.test(category) ? category : "",
    sort: pick(params.get("sort"), productSorts, "newest"),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export const bulkProductActions = [
  "publish",
  "draft",
  "archive",
  "delete",
  "addCategory",
  "offer",
] as const;
export type BulkProductAction = (typeof bulkProductActions)[number];

/** What the list's bulk bar sends: the action, the products and, for some, a value. */
export const bulkProductsSchema = z.object({
  action: z.enum(bulkProductActions),
  ids: z.array(z.uuid()).check(z.minLength(1), z.maxLength(BULK_PRODUCTS_MAX)),
  categoryId: z.optional(z.uuid()),
  /** "offer": percent off the regular price, 0 takes the offer away. */
  percent: z.optional(z.coerce.number().check(z.int(), z.minimum(0), z.maximum(90))),
});

/** A new collection, from the product editor or the collections screen. */
export const categoryFormSchema = z.object({
  name: z
    .string({ error: message("forms.categoryNameRequired") })
    .check(
      z.trim(),
      z.minLength(1, message("forms.categoryNameRequired")),
      z.maxLength(80, message("forms.textTooLong")),
    ),
  parentId: z.optional(z.union([z.literal(""), z.uuid()])),
});

/**
 * The time zone a store's dates are read in ("offer until the 20th"), from its country. Costa
 * Rica when the country isn't listed: where Monaztore's stores sell today.
 */
const countryZones: Record<string, string> = {
  CR: "America/Costa_Rica",
  PA: "America/Panama",
  NI: "America/Managua",
  HN: "America/Tegucigalpa",
  SV: "America/El_Salvador",
  GT: "America/Guatemala",
  MX: "America/Mexico_City",
  CO: "America/Bogota",
  PE: "America/Lima",
  CL: "America/Santiago",
  AR: "America/Argentina/Buenos_Aires",
  US: "America/New_York",
  ES: "Europe/Madrid",
};

export function storeTimeZone(country: string | null | undefined): string {
  return countryZones[(country ?? "").toUpperCase()] ?? "America/Costa_Rica";
}
