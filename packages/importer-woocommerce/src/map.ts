import type {
  ImportedCategory,
  ImportedCustomer,
  ImportedProduct,
  ImportedVariant,
} from "@monaztore/contracts";
import type { Store, V3 } from "./types";

/** Monaztore stores money in minor units with two decimals (₡1 = 100 céntimos). */
const MINOR_DIGITS = 2;

/**
 * `"12500"` → 1250000, `"12,500.5"` → 1250050. WooCommerce sends prices as decimal strings;
 * they are parsed as text so no float rounding sneaks in. Empty means "no price".
 */
export function decimalToMinor(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const clean = value.trim().replace(/,/g, "");
  if (clean === "") return null;
  const match = /^(\d+)(?:\.(\d+))?$/.exec(clean);
  if (!match) return null;
  const [, whole = "0", fraction = ""] = match;
  const digits = `${fraction}${"0".repeat(MINOR_DIGITS)}`.slice(0, MINOR_DIGITS);
  return Number(whole) * 10 ** MINOR_DIGITS + Number(digits);
}

/**
 * The Store API already sends minor units, in the shop's own precision (`currency_minor_unit`,
 * 0 for a shop set up without decimals). Brought to Monaztore's two digits.
 */
export function storeMinorToMinor(
  value: string | null | undefined,
  minorUnit: number,
): number | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 10 ** (MINOR_DIGITS - minorUnit));
}

/** Current price and the crossed-out one: a sale price shows the regular price as "before". */
export function pricing(regular: number | null, sale: number | null) {
  if (sale !== null && regular !== null && sale < regular) {
    return { price: sale, compareAtPrice: regular };
  }
  return { price: sale ?? regular, compareAtPrice: null };
}

/** `https://shop.com/producto/camisa/` → `/producto/camisa/`, the path to redirect from. */
export function pathOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const path = decodeURI(new URL(url).pathname);
    return path === "/" ? null : path;
  } catch {
    return null;
  }
}

/** Jetpack's image CDN: `i0.wp.com/<shop host>/<path>` serves a resized copy of the shop's file. */
const jetpackCdn = /^i[0-3]\.wp\.com$/;

/**
 * The address of an image's own file, or null when there is none (WordPress answers `false` for
 * a category without an image). A Jetpack CDN address becomes the shop's original file, at full
 * size and on the shop's own host, so copying the images needs no other host.
 */
export function imageSrc(src: string | false | null | undefined): string | null {
  if (!src) return null;
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  if (jetpackCdn.test(url.hostname)) {
    const [, host, ...rest] = url.pathname.split("/");
    if (host && rest.length > 0) return `https://${host}/${rest.join("/")}`;
  }
  return url.toString();
}

/** WordPress encodes `&`, `'` and friends in names: shown as text, they must be plain. */
export function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "–",
    mdash: "—",
    hellip: "…",
  };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    }
    if (code.startsWith("#")) return String.fromCodePoint(Number(code.slice(1)));
    return named[code.toLowerCase()] ?? entity;
  });
}

const weightToGrams: Record<string, number> = { kg: 1000, g: 1, lbs: 453.592, oz: 28.3495 };

export function toGrams(weight: string | null | undefined, unit: string): number | null {
  const amount = Number.parseFloat(weight ?? "");
  const factor = weightToGrams[unit];
  if (!Number.isFinite(amount) || amount <= 0 || !factor) return null;
  return Math.round(amount * factor);
}

const productStatus: Record<string, ImportedProduct["status"]> = {
  publish: "active",
  draft: "draft",
  pending: "draft",
  private: "draft",
  trash: "archived",
};

/**
 * SEO title and description written in Yoast or Rank Math, the two SEO plugins most WooCommerce
 * shops use. Values with template variables (`%%title%%`, `%title%`) are left out: they are
 * defaults the new store generates on its own.
 */
export function seoFromMeta(meta: V3.MetaData[] | undefined) {
  const read = (...keys: string[]) => {
    for (const key of keys) {
      const value = meta?.find((entry) => entry.key === key)?.value;
      if (typeof value === "string" && value.trim() !== "" && !/%%?[a-z_]+%%?/i.test(value)) {
        return decodeEntities(value.trim());
      }
    }
    return null;
  };
  return {
    seoTitle: read("_yoast_wpseo_title", "rank_math_title"),
    seoDescription: read("_yoast_wpseo_metadesc", "rank_math_description"),
  };
}

function productImages(images: { src: string | false; alt?: string }[]) {
  return images.flatMap((image) => {
    const url = imageSrc(image.src);
    return url ? [{ url, alt: image.alt ?? "" }] : [];
  });
}

export function mapV3Category(category: V3.Category, url?: string): ImportedCategory {
  return {
    externalId: String(category.id),
    parentExternalId: category.parent ? String(category.parent) : null,
    slug: category.slug,
    name: decodeEntities(category.name),
    description: category.description,
    imageUrl: imageSrc(category.image?.src),
    position: category.menu_order ?? 0,
    oldPath: pathOf(url),
  };
}

function stock(manage: boolean | "parent", quantity: number | null, status: string) {
  return {
    stockQuantity: manage === true ? (quantity ?? 0) : null,
    inStock: status !== "outofstock",
  };
}

export function mapV3Variation(variation: V3.Variation): ImportedVariant {
  return {
    externalId: String(variation.id),
    sku: variation.sku || null,
    options: Object.fromEntries(
      variation.attributes.map((attribute) => [decodeEntities(attribute.name), attribute.option]),
    ),
    ...pricing(decimalToMinor(variation.regular_price), decimalToMinor(variation.sale_price)),
    ...stock(variation.manage_stock, variation.stock_quantity, variation.stock_status),
    imageUrl: imageSrc(variation.image?.src),
  };
}

export function mapV3Product(
  product: V3.Product,
  variations: V3.Variation[],
  { weightUnit = "kg" }: { weightUnit?: string } = {},
): ImportedProduct {
  const regular = decimalToMinor(product.regular_price) ?? decimalToMinor(product.price);
  return {
    externalId: String(product.id),
    slug: product.slug,
    name: decodeEntities(product.name),
    description: product.description,
    shortDescription: product.short_description,
    status: productStatus[product.status] ?? "draft",
    sku: product.sku || null,
    ...pricing(regular, decimalToMinor(product.sale_price)),
    ...stock(product.manage_stock, product.stock_quantity, product.stock_status),
    weightGrams: toGrams(product.weight, weightUnit),
    ...seoFromMeta(product.meta_data),
    categoryExternalIds: product.categories.map((category) => String(category.id)),
    images: productImages(product.images),
    options: product.attributes
      .filter((attribute) => attribute.variation)
      .map((attribute) => ({ name: decodeEntities(attribute.name), values: attribute.options })),
    variants: variations.map(mapV3Variation),
    oldPath: pathOf(product.permalink),
  };
}

export function mapV3Customer(customer: V3.Customer): ImportedCustomer | null {
  if (!customer.email) return null;
  return {
    externalId: String(customer.id),
    email: customer.email.trim().toLowerCase(),
    firstName: customer.first_name || customer.billing?.first_name || "",
    lastName: customer.last_name || customer.billing?.last_name || "",
    phone: customer.billing?.phone || null,
    // WooCommerce doesn't record marketing consent: it is never assumed.
    acceptsMarketing: false,
    ordersCount: 0,
    totalSpent: 0,
  };
}

export function mapStoreCategory(category: Store.Category): ImportedCategory {
  return {
    externalId: String(category.id),
    parentExternalId: category.parent ? String(category.parent) : null,
    slug: category.slug,
    name: decodeEntities(category.name),
    description: category.description,
    imageUrl: imageSrc(category.image?.src),
    position: 0,
    oldPath: pathOf(category.permalink),
  };
}

function storePricing(prices: Store.Prices) {
  const unit = prices.currency_minor_unit;
  const sale = prices.sale_price !== prices.regular_price ? prices.sale_price : "";
  return pricing(storeMinorToMinor(prices.regular_price, unit), storeMinorToMinor(sale, unit));
}

/**
 * A product as the public Store API shows it. Without keys there is no stock count, no drafts
 * and no SEO fields: everything it brings is published, and the rest stays empty.
 */
export function mapStoreProduct(
  product: Store.Product,
  variations: Store.Product[],
): ImportedProduct {
  return {
    externalId: String(product.id),
    slug: product.slug,
    name: decodeEntities(product.name),
    description: product.description,
    shortDescription: product.short_description,
    status: "active",
    sku: product.sku || null,
    ...storePricing(product.prices),
    stockQuantity: null,
    inStock: product.is_in_stock,
    weightGrams: null,
    seoTitle: null,
    seoDescription: null,
    categoryExternalIds: product.categories.map((category) => String(category.id)),
    images: productImages(product.images),
    options: product.attributes
      .filter((attribute) => attribute.has_variations)
      .map((attribute) => ({
        name: decodeEntities(attribute.name),
        values: attribute.terms.map((term) => decodeEntities(term.name)),
      })),
    variants: product.variations.map((variation) => {
      const detail = variations.find((candidate) => candidate.id === variation.id);
      return {
        externalId: String(variation.id),
        sku: detail?.sku || null,
        options: Object.fromEntries(
          variation.attributes.map((attribute) => [
            decodeEntities(attribute.name),
            attribute.value,
          ]),
        ),
        ...(detail ? storePricing(detail.prices) : { price: null, compareAtPrice: null }),
        stockQuantity: null,
        inStock: detail?.is_in_stock ?? product.is_in_stock,
        imageUrl: imageSrc(detail?.images[0]?.src),
      };
    }),
    oldPath: pathOf(product.permalink),
  };
}
