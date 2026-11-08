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
  ...timestamps,
});

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
    seoTitle: text(),
    seoDescription: text(),
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
