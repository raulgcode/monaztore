import { randomUUID } from "node:crypto";
import type { ImportedCatalog } from "@monaztore/contracts";
import { addStoreDomain, importCatalog } from "@monaztore/core";
import type { Workspace } from "./database";

/** A small shop, like one brought over from WooCommerce: two collections, three products. */
export const sampleCatalog: ImportedCatalog = {
  source: "woocommerce",
  sourceUrl: "https://shop.example",
  currency: "CRC",
  categories: [
    {
      externalId: "c1",
      parentExternalId: null,
      slug: "kitchen",
      name: "Kitchen",
      description: "<p>Everything for <strong>coffee</strong> lovers.</p>",
      imageUrl: null,
      position: 0,
      oldPath: "/product-category/kitchen/",
    },
  ],
  products: [
    {
      externalId: "p1",
      slug: "pura-vida-mug",
      name: "Pura Vida mug",
      description: "<p>Ceramic, 350 ml.</p>",
      shortDescription: "",
      status: "active",
      sku: "MUG-01",
      price: 599_000,
      compareAtPrice: 750_000,
      stockQuantity: 5,
      inStock: true,
      weightGrams: 400,
      seoTitle: "Pura Vida mug, made in Costa Rica",
      seoDescription: "A ceramic mug for your morning coffee.",
      categoryExternalIds: ["c1"],
      images: [],
      options: [],
      variants: [],
      oldPath: "/product/pura-vida-mug/",
    },
    {
      externalId: "p2",
      slug: "coffee-beans",
      name: "Coffee beans",
      description: "",
      shortDescription: "",
      status: "active",
      sku: null,
      price: 1_200_000,
      compareAtPrice: null,
      stockQuantity: 0,
      inStock: false,
      weightGrams: null,
      seoTitle: null,
      seoDescription: null,
      categoryExternalIds: [],
      images: [],
      options: [],
      variants: [],
      oldPath: null,
    },
    {
      externalId: "p3",
      slug: "secret-draft",
      name: "Secret draft",
      description: "",
      shortDescription: "",
      status: "draft",
      sku: null,
      price: 100_000,
      compareAtPrice: null,
      stockQuantity: null,
      inStock: true,
      weightGrams: null,
      seoTitle: null,
      seoDescription: null,
      categoryExternalIds: [],
      images: [],
      options: [],
      variants: [],
      oldPath: null,
    },
  ],
  customers: [],
  warnings: [],
};

/**
 * Puts the catalog in the workspace's store and connects a domain of its own, `*.localhost`
 * (which the browser sends to this machine). Returns the store's address.
 */
export async function openStore(
  workspace: Workspace,
  baseURL: string | undefined,
  catalog: ImportedCatalog = sampleCatalog,
): Promise<string> {
  await importCatalog(workspace.tenant, catalog);
  const hostname = `store-${randomUUID().slice(0, 8)}.localhost`;
  await addStoreDomain(workspace.tenant, hostname, { primary: true });
  const port = new URL(baseURL ?? "http://localhost:4173").port;
  return `http://${hostname}:${port}`;
}
