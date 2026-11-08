import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";

// A store is an organization (Better Auth). Every table here carries organization_id and every
// query in core filters by it.

const organizationId = () =>
  uuid()
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/**
 * Where a store answers: `mitienda.com`, `www.mitienda.com`, `mitienda.monaztore.app`. The
 * storefront finds its store from the request's Host, so a hostname belongs to one store only.
 */
export const storeDomain = pgTable(
  "store_domain",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: organizationId(),
    hostname: text().notNull(),
    /** The one canonical links and redirects point to. */
    primary: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("store_domain_hostname_idx").on(table.hostname),
    index("store_domain_organization_idx").on(table.organizationId),
  ],
);

/** Each store's own settings: currency and the like. One row per store. */
export const storeSettings = pgTable("store_settings", {
  organizationId: uuid()
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  /** ISO 4217. Prices are stored in minor units (cents, céntimos) of this currency. */
  currency: text().notNull().default("CRC"),
  /** How shoppers pay: SINPE Móvil and bank transfer for now (see `StorePayments`). */
  payments: jsonb().$type<StorePayments>().notNull().default({}),
  /**
   * The language shoppers see (`en`, `es`) unless they pick another at the foot of the store;
   * Spanish while the owner hasn't chosen. Never the browser's: the store speaks its own language.
   */
  locale: text(),
  /** ISO 3166 country the store sells from. Costa Rica (CR) turns on Hacienda's invoicing. */
  country: text().notNull().default("CR"),
  /** The number the next order gets: #1001, #1002… Taken under the row's lock. */
  nextOrderNumber: integer().notNull().default(1001),
  /** The storefront's theme and the brand it carries (see `StoreThemeSettings`). */
  theme: jsonb().$type<StoreThemeSettings>().notNull().default({}),
  ...timestamps,
});

/**
 * How the storefront looks: one of the themes packaged in core and the store's brand on top.
 * Every field is optional: what's missing comes from the theme.
 */
export interface StoreThemeSettings {
  /** A theme of `storeThemes` in core; unknown or missing = the default theme. */
  theme?: string;
  /** One of the theme's palettes (`storeThemes[theme].palettes`); the first when unset. */
  palette?: string;
  /** `#rrggbb`. core adjusts it so it reads in light and dark. */
  brandColor?: string;
  /** `/media/…` addresses of the store's own files. */
  logoUrl?: string;
  heroImageUrl?: string;
  /** The cover photo at phone size (720 px), so a phone never downloads the big one. */
  heroImageSmallUrl?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  /** A line above the header: "Free shipping over ₡30 000". */
  announcement?: string;
  /**
   * Catalog filters the owner turned off: `price`, `availability` or `option:<name>` ("option:Talla").
   * The rest show as the theme lays them out.
   */
  hiddenFilters?: string[];
  /** What the store calls its categories ("Designs", "Brands"); empty = "Categories". */
  categoriesLabel?: string;
  /** Up to three short promises ("Delivery in 24 h"); none = the theme's own. */
  highlights?: string[];
}

/** Manual payments the store accepts, with what the shopper needs to pay. */
export interface StorePayments {
  sinpe?: { enabled: boolean; phone: string; holder: string };
  transfer?: { enabled: boolean; bank: string; iban: string; holder: string };
}

export type PaymentMethod = "sinpe" | "transfer";

/**
 * pending_payment → the shopper still has to pay; payment_submitted → they sent the reference and
 * the store checks it; paid; cancelled. Shipping states come later.
 */
export type OrderStatus = "pending_payment" | "payment_submitted" | "paid" | "cancelled";

/** Whom the shopper wants the invoice made out to, in Costa Rica (Hacienda's ID types). */
export interface OrderTaxId {
  idType: "01" | "02" | "03" | "04";
  idNumber: string;
  name: string;
}

export interface ShippingAddress {
  line1: string;
  city: string;
  province: string;
  notes: string;
}

/** An order of a store. The shopper opens it with a link whose token is kept only as SHA-256. */
export const order = pgTable(
  "order",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: organizationId(),
    number: integer().notNull(),
    tokenHash: text().notNull(),
    status: text().$type<OrderStatus>().notNull().default("pending_payment"),
    paymentMethod: text().$type<PaymentMethod>().notNull(),
    /** What the shopper says identifies their payment (SINPE or transfer reference). */
    paymentReference: text(),
    paymentSubmittedAt: timestamp({ withTimezone: true }),
    paidAt: timestamp({ withTimezone: true }),
    customerId: uuid().references(() => customer.id, { onDelete: "set null" }),
    email: text().notNull(),
    name: text().notNull(),
    phone: text().notNull(),
    shippingAddress: jsonb().$type<ShippingAddress>().notNull(),
    /** False when every line is a digital download: nothing to ship, the address is empty. */
    needsShipping: boolean().notNull().default(true),
    /**
     * The downloads email's link (`/downloads/:token`), set when the order is paid: only its
     * SHA-256. Sending the email again makes a new one and the old link stops working.
     */
    downloadTokenHash: text(),
    /** "Invoice in my name": only where the store issues electronic invoices. */
    taxId: jsonb().$type<OrderTaxId>(),
    currency: text().notNull(),
    /** Minor units. */
    subtotal: bigint({ mode: "number" }).notNull(),
    /** What the coupon took off (minor units); `total` = `subtotal` − `discount`. */
    discount: bigint({ mode: "number" }).notNull().default(0),
    /** The coupon used, as typed then (uppercase): it stays if the coupon is deleted. */
    couponCode: text(),
    couponId: uuid().references(() => coupon.id, { onDelete: "set null" }),
    total: bigint({ mode: "number" }).notNull(),
    locale: text().notNull().default("en"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("order_number_idx").on(table.organizationId, table.number),
    uniqueIndex("order_token_idx").on(table.tokenHash),
    uniqueIndex("order_download_token_idx").on(table.downloadTokenHash),
    index("order_status_idx").on(table.organizationId, table.status, table.createdAt),
  ],
);

/** What was bought, copied at the time: renaming or repricing a product never changes an order. */
export const orderLine = pgTable(
  "order_line",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    productId: uuid().references(() => product.id, { onDelete: "set null" }),
    variantId: uuid().references(() => productVariant.id, { onDelete: "set null" }),
    name: text().notNull(),
    variantTitle: text(),
    sku: text(),
    unitPrice: bigint({ mode: "number" }).notNull(),
    quantity: integer().notNull(),
    lineTotal: bigint({ mode: "number" }).notNull(),
    /** This line's share of the order's coupon (minor units): what it really cost is the difference. */
    discount: bigint({ mode: "number" }).notNull().default(0),
    position: integer().notNull().default(0),
  },
  (table) => [index("order_line_order_idx").on(table.orderId, table.position)],
);

/**
 * Where a row came from when it was imported (WooCommerce, Shopify…), so importing again
 * updates it instead of duplicating it.
 */
const externalRef = {
  externalSource: text(),
  externalId: text(),
};

export const category = pgTable(
  "category",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: organizationId(),
    parentId: uuid(),
    slug: text().notNull(),
    name: text().notNull(),
    description: text().notNull().default(""),
    imageUrl: text(),
    position: integer().notNull().default(0),
    ...externalRef,
    ...timestamps,
  },
  (table) => [
    uniqueIndex("category_slug_idx").on(table.organizationId, table.slug),
    uniqueIndex("category_external_idx").on(
      table.organizationId,
      table.externalSource,
      table.externalId,
    ),
  ],
);

export const product = pgTable(
  "product",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: organizationId(),
    slug: text().notNull(),
    name: text().notNull(),
    /** HTML as written by the store; sanitized when rendered. */
    description: text().notNull().default(""),
    shortDescription: text().notNull().default(""),
    /** draft | active | archived */
    status: text().notNull().default("draft"),
    sku: text(),
    /** In minor units of the store's currency. Variants may override it. */
    price: bigint({ mode: "number" }),
    compareAtPrice: bigint({ mode: "number" }),
    /** null = the store doesn't track stock for it. */
    stockQuantity: integer(),
    inStock: boolean().notNull().default(true),
    weightGrams: integer(),
    /**
     * When the offer (`price` below `compareAtPrice`) runs, for the product and its variants.
     * Outside these dates the regular price (`compareAtPrice`) is what it costs. null = open.
     */
    saleStartsAt: timestamp({ withTimezone: true }),
    saleEndsAt: timestamp({ withTimezone: true }),
    seoTitle: text(),
    seoDescription: text(),
    /**
     * A digital product (one with `product_file`s): how many times each file can be downloaded
     * per unit bought, and for how many days after the payment. null = no limit.
     */
    downloadLimit: integer().default(5),
    downloadDays: integer().default(30),
    ...externalRef,
    ...timestamps,
  },
  (table) => [
    uniqueIndex("product_slug_idx").on(table.organizationId, table.slug),
    uniqueIndex("product_external_idx").on(
      table.organizationId,
      table.externalSource,
      table.externalId,
    ),
    index("product_status_idx").on(table.organizationId, table.status),
  ],
);

export const productCategory = pgTable(
  "product_category",
  {
    productId: uuid()
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    categoryId: uuid()
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.categoryId] }),
    index("product_category_category_idx").on(table.categoryId),
  ],
);

export const productImage = pgTable(
  "product_image",
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    url: text().notNull(),
    alt: text().notNull().default(""),
    position: integer().notNull().default(0),
  },
  (table) => [index("product_image_product_idx").on(table.productId, table.position)],
);

/** What a customer picks: "Talla" with S, M, L. Variants combine one value of each. */
export const productOption = pgTable(
  "product_option",
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    name: text().notNull(),
    values: jsonb().$type<string[]>().notNull(),
    /**
     * The shopper picks it (its values make the variants). Off, it only describes the product
     * ("Material: Algodón"): it still shows as a catalog filter.
     */
    variation: boolean().notNull().default(true),
    position: integer().notNull().default(0),
  },
  (table) => [index("product_option_product_idx").on(table.productId, table.position)],
);

export const productVariant = pgTable(
  "product_variant",
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    sku: text(),
    /** { "Talla": "M", "Color": "Rojo" }; an option missing here means "any". */
    options: jsonb().$type<Record<string, string>>().notNull(),
    price: bigint({ mode: "number" }),
    compareAtPrice: bigint({ mode: "number" }),
    stockQuantity: integer(),
    inStock: boolean().notNull().default(true),
    imageUrl: text(),
    position: integer().notNull().default(0),
    ...externalRef,
  },
  (table) => [
    index("product_variant_product_idx").on(table.productId, table.position),
    uniqueIndex("product_variant_external_idx").on(
      table.productId,
      table.externalSource,
      table.externalId,
    ),
  ],
);

/** 301s, so links to the old site (and Google's index) keep working after a migration. */
export const redirect = pgTable(
  "redirect",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: organizationId(),
    fromPath: text().notNull(),
    toPath: text().notNull(),
    statusCode: integer().notNull().default(301),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("redirect_from_idx").on(table.organizationId, table.fromPath)],
);

/**
 * A page the store writes in the workspace's block editor ("About us", "FAQ"), shown at
 * `/<slug>` on the storefront. `blocks` is the `pageBlocksSchema` of contracts, checked by
 * core on every save; text blocks keep sanitized HTML.
 */
export const page = pgTable(
  "page",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: organizationId(),
    slug: text().notNull(),
    title: text().notNull(),
    /** draft | published */
    status: text().notNull().default("draft"),
    blocks: jsonb().notNull().default([]),
    seoTitle: text(),
    seoDescription: text(),
    publishedAt: timestamp({ withTimezone: true }),
    ...externalRef,
    ...timestamps,
  },
  (table) => [
    uniqueIndex("page_slug_idx").on(table.organizationId, table.slug),
    uniqueIndex("page_external_idx").on(
      table.organizationId,
      table.externalSource,
      table.externalId,
    ),
  ],
);

/** One run of an importer: what it brought and how it ended. */
export const importRun = pgTable(
  "import_run",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: organizationId(),
    source: text().notNull(),
    sourceUrl: text().notNull(),
    /** running | succeeded | failed */
    status: text().notNull(),
    stats: jsonb().$type<Record<string, number>>().notNull().default({}),
    error: text(),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (table) => [index("import_run_organization_idx").on(table.organizationId, table.startedAt)],
);

/**
 * A store's customer. Can exist without an account (guest checkout, imported). Marketing email
 * only goes to those with `acceptsMarketing` and a date: consent is never assumed.
 */
export const customer = pgTable(
  "customer",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: organizationId(),
    email: text().notNull(),
    firstName: text().notNull().default(""),
    lastName: text().notNull().default(""),
    phone: text(),
    acceptsMarketing: boolean().notNull().default(false),
    marketingConsentAt: timestamp({ withTimezone: true }),
    ordersCount: integer().notNull().default(0),
    /** In minor units of the store's currency. */
    totalSpent: bigint({ mode: "number" }).notNull().default(0),
    ...externalRef,
    ...timestamps,
  },
  (table) => [
    uniqueIndex("customer_email_idx").on(table.organizationId, table.email),
    uniqueIndex("customer_external_idx").on(
      table.organizationId,
      table.externalSource,
      table.externalId,
    ),
  ],
);

/**
 * A file a digital product delivers (an e-book, a template, a course in a .zip). It lives in the
 * store's files under `downloads/<organization>/…`, never under `organizations/…`, so `/media`
 * never serves it: only a paid order's download does.
 */
export const productFile = pgTable(
  "product_file",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: organizationId(),
    productId: uuid()
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    /** The key in the file store, named after its contents. */
    key: text().notNull(),
    /** The name the shopper's browser saves it with. */
    fileName: text().notNull(),
    contentType: text().notNull(),
    size: bigint({ mode: "number" }).notNull(),
    position: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("product_file_product_idx").on(table.productId, table.position)],
);

/**
 * A file an order delivers, copied when the order is placed: changing or removing the product's
 * file never takes away what someone bought. It opens once the order is paid, until
 * `expiresAt` and up to `downloadLimit` times.
 */
export const orderDownload = pgTable(
  "order_download",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: organizationId(),
    orderId: uuid()
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    orderLineId: uuid()
      .notNull()
      .references(() => orderLine.id, { onDelete: "cascade" }),
    key: text().notNull(),
    fileName: text().notNull(),
    contentType: text().notNull(),
    size: bigint({ mode: "number" }).notNull(),
    /** null = as many times as they want. Already multiplied by the quantity bought. */
    downloadLimit: integer(),
    /** Days it stays open after the payment; null = always. */
    downloadDays: integer(),
    /** Set when the order is paid (`paidAt` + `downloadDays`). */
    expiresAt: timestamp({ withTimezone: true }),
    downloads: integer().notNull().default(0),
    lastDownloadAt: timestamp({ withTimezone: true }),
    position: integer().notNull().default(0),
  },
  (table) => [index("order_download_order_idx").on(table.orderId, table.position)],
);

export type CouponKind = "percent" | "fixed";

/**
 * A discount code the store gives out ("VERANO10"): a percentage or an amount off the cart,
 * between two dates, a number of times, from a minimum, on some products or collections.
 * `usedCount` goes up when an order uses it and down when that order is cancelled.
 */
export const coupon = pgTable(
  "coupon",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: organizationId(),
    /** Always uppercase: shoppers type it any way. */
    code: text().notNull(),
    /** A note for the team ("Instagram, November"); shoppers never see it. */
    note: text().notNull().default(""),
    kind: text().$type<CouponKind>().notNull(),
    /** percent: 1–100; fixed: minor units of the store's currency. */
    amount: bigint({ mode: "number" }).notNull(),
    startsAt: timestamp({ withTimezone: true }),
    endsAt: timestamp({ withTimezone: true }),
    /** Orders that can use it, in total and per email; null = no limit. */
    usageLimit: integer(),
    usageLimitPerCustomer: integer(),
    /** The cart's subtotal it needs (minor units); null = any. */
    minSubtotal: bigint({ mode: "number" }),
    /** Only on these products or collections; both empty = the whole cart. */
    productIds: jsonb().$type<string[]>().notNull().default([]),
    categoryIds: jsonb().$type<string[]>().notNull().default([]),
    /** Products already on offer don't get it too. */
    excludeSaleItems: boolean().notNull().default(false),
    active: boolean().notNull().default(true),
    usedCount: integer().notNull().default(0),
    ...timestamps,
  },
  (table) => [uniqueIndex("coupon_code_idx").on(table.organizationId, table.code)],
);
