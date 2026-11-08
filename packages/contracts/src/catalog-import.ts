import { z } from "zod/mini";

// What any importer (WooCommerce today, Shopify later) hands to core: a catalog already in
// Monaztore's shape. Prices are integers in minor units (céntimos) of `currency`.

const money = z.nullable(z.int().check(z.nonnegative()));

export const importedCategorySchema = z.object({
  externalId: z.string(),
  parentExternalId: z.nullable(z.string()),
  slug: z.string().check(z.minLength(1)),
  name: z.string(),
  description: z.string(),
  imageUrl: z.nullable(z.string()),
  position: z.int(),
  /** Path on the old site, e.g. /categoria-producto/ropa/, to redirect from. */
  oldPath: z.nullable(z.string()),
});

export const importedVariantSchema = z.object({
  externalId: z.string(),
  sku: z.nullable(z.string()),
  options: z.record(z.string(), z.string()),
  price: money,
  compareAtPrice: money,
  stockQuantity: z.nullable(z.int()),
  inStock: z.boolean(),
  imageUrl: z.nullable(z.string()),
});

export const importedProductSchema = z.object({
  externalId: z.string(),
  slug: z.string().check(z.minLength(1)),
  name: z.string(),
  description: z.string(),
  shortDescription: z.string(),
  status: z.enum(["draft", "active", "archived"]),
  sku: z.nullable(z.string()),
  price: money,
  compareAtPrice: money,
  stockQuantity: z.nullable(z.int()),
  inStock: z.boolean(),
  weightGrams: z.nullable(z.int()),
  seoTitle: z.nullable(z.string()),
  seoDescription: z.nullable(z.string()),
  categoryExternalIds: z.array(z.string()),
  images: z.array(z.object({ url: z.string(), alt: z.string() })),
  options: z.array(z.object({ name: z.string(), values: z.array(z.string()) })),
  variants: z.array(importedVariantSchema),
  oldPath: z.nullable(z.string()),
});

export const importedCustomerSchema = z.object({
  externalId: z.string(),
  email: z.string().check(z.minLength(3)),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.nullable(z.string()),
  /** Only true when the source recorded consent; never inferred. */
  acceptsMarketing: z.boolean(),
  ordersCount: z.int(),
  totalSpent: z.int(),
});

export const importedCatalogSchema = z.object({
  source: z.string(),
  sourceUrl: z.string(),
  currency: z.string().check(z.length(3)),
  categories: z.array(importedCategorySchema),
  products: z.array(importedProductSchema),
  customers: z.array(importedCustomerSchema),
  /** What the importer saw but couldn't bring, for the report. */
  warnings: z.array(z.string()),
});

export type ImportedCategory = z.infer<typeof importedCategorySchema>;
export type ImportedVariant = z.infer<typeof importedVariantSchema>;
export type ImportedProduct = z.infer<typeof importedProductSchema>;
export type ImportedCustomer = z.infer<typeof importedCustomerSchema>;
export type ImportedCatalog = z.infer<typeof importedCatalogSchema>;
