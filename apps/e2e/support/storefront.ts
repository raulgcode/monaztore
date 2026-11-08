import { randomUUID } from "node:crypto";
import type { ImportedCatalog } from "@monaztore/contracts";
import {
  addStoreDomain,
  copyCatalogImages,
  createDigitalProduct,
  getDigitalProduct,
  importCatalog,
  listImportedProducts,
  placeOrder,
  submitPaymentReference,
  updateStorePayments,
} from "@monaztore/core";
import { defaultFilesDir, diskFileStore } from "@monaztore/storage";
import { webImage } from "@monaztore/storage/images";
import type { APIRequestContext } from "@playwright/test";
import sharp from "sharp";
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
  pages: [
    {
      externalId: "w1",
      slug: "questions",
      title: "Questions",
      status: "published",
      oldPath: "/preguntas-frecuentes/",
      blocks: [
        { type: "heading", id: "b1", text: "Shipping", level: 2 },
        {
          type: "faq",
          id: "b2",
          items: [{ question: "How long does shipping take?", answer: "Two to three days." }],
        },
      ],
    },
  ],
  warnings: [],
};

/**
 * Puts the catalog in the workspace's store, takes SINPE and transfers, and connects a domain of its own, `*.localhost`
 * (which the browser sends to this machine). Returns the store's address.
 */
export async function openStore(
  workspace: Workspace,
  baseURL: string | undefined,
  catalog: ImportedCatalog = sampleCatalog,
): Promise<string> {
  await importCatalog(workspace.tenant, catalog);
  await updateStorePayments(workspace.tenant, {
    sinpe: { enabled: true, phone: "8888-1234", holder: "My company S.A." },
    transfer: {
      enabled: true,
      bank: "Banco Nacional",
      iban: "CR05015202001026284066",
      holder: "My company S.A.",
    },
  });
  const hostname = `store-${randomUUID().slice(0, 8)}.localhost`;
  await addStoreDomain(workspace.tenant, hostname, { primary: true });
  const port = new URL(baseURL ?? "http://localhost:4173").port;
  return `http://${hostname}:${port}`;
}

const photoColors = ["#f5f0e6", "#dbeafe", "#dcfce7"];

/**
 * The sample catalog with photos of the mug on the old shop (one, or up to three), copied to the
 * store's files as the importer does (the web server reads the same `.data/files`).
 */
export async function catalogWithCopiedPhoto(
  workspace: Workspace,
  photos = 1,
): Promise<ImportedCatalog> {
  const images = photoColors.slice(0, photos).map((_, index) => ({
    url: `https://shop.example/wp-content/uploads/mug-${index + 1}.png`,
    alt: index === 0 ? "White mug" : `White mug, photo ${index + 1}`,
  }));
  const catalog: ImportedCatalog = {
    ...sampleCatalog,
    products: sampleCatalog.products.map((product) =>
      product.slug === "pura-vida-mug" ? { ...product, images } : product,
    ),
  };
  const { catalog: copied } = await copyCatalogImages(workspace.tenant, catalog, {
    files: diskFileStore(defaultFilesDir()),
    download: (url) =>
      sharp({
        create: {
          width: 800,
          height: 800,
          channels: 3,
          background: photoColors[Number(url.match(/mug-(\d)/)?.[1] ?? 1) - 1] ?? "#f5f0e6",
        },
      })
        .png()
        .toBuffer(),
    convert: (bytes) => webImage(bytes),
  });
  return copied;
}

/**
 * A request to the store without a browser (a crawler, a link checker). Node doesn't resolve
 * `*.localhost` like the browser does, so it goes to this machine with the store's Host.
 */
export function requestStore(
  request: APIRequestContext,
  store: string,
  path: string,
  options: { maxRedirects?: number } = {},
) {
  const url = new URL(path, store);
  return request.get(`http://127.0.0.1:${url.port}${url.pathname}${url.search}`, {
    ...options,
    headers: { Host: url.host },
  });
}

/**
 * An order a shopper placed in the workspace's store: one Pura Vida mug, paid with SINPE Móvil,
 * and, with `reference`, the payment's reference already sent. Returns its number.
 */
export async function placeSampleOrder(
  workspace: Workspace,
  { name, reference }: { name: string; reference?: string },
): Promise<number> {
  await importCatalog(workspace.tenant, sampleCatalog);
  await updateStorePayments(workspace.tenant, {
    sinpe: { enabled: true, phone: "8888-1234", holder: "My company S.A." },
  });
  const mug = (await listImportedProducts(workspace.tenant, "woocommerce")).find(
    (product) => product.slug === "pura-vida-mug",
  );
  if (!mug) throw new Error("No mug in the store");
  const store = {
    db: workspace.tenant.db,
    store: {
      organizationId: workspace.organizationId,
      name: "My company",
      slug: workspace.slug,
      hostname: "localhost",
    },
  };
  const placed = await placeOrder(store, {
    cart: [{ productId: mug.id, variantId: null, quantity: 1 }],
    checkout: {
      email: "shopper@example.com",
      name,
      phone: "8888-0000",
      line1: "100 m norte del parque",
      city: "Heredia",
      province: "Heredia",
      notes: "",
      paymentMethod: "sinpe",
    },
    locale: "en",
  });
  if (reference) await submitPaymentReference(store, placed.token, reference);
  return placed.number;
}

/** What the sample e-book's file holds: the scenario checks the download brings these bytes. */
export const ebookContents = "%PDF-1.7 The Pura Vida brewing handbook";

/**
 * A digital product made in the workspace, as "New digital product" does: the brewing handbook,
 * ₡4,500,
 * with its PDF in the store's files (the web server reads the same `.data/files`). The worker's
 * workspace is shared, so a second one gets its own address (`brewing-handbook-2`): use `slug`.
 */
export async function sellEbook(
  workspace: Workspace,
  rules: { downloadLimit?: number | null; downloadDays?: number | null } = {},
): Promise<{ id: string; slug: string }> {
  const id = await createDigitalProduct(
    workspace.tenant,
    { files: diskFileStore(defaultFilesDir()) },
    {
      name: "Brewing handbook",
      price: 450_000,
      description: "Forty pages, step by step.",
      file: {
        bytes: new TextEncoder().encode(ebookContents),
        fileName: "Brewing handbook.pdf",
        contentType: "application/pdf",
      },
      ...rules,
    },
  );
  const product = await getDigitalProduct(workspace.tenant, id);
  if (!product) throw new Error("The e-book wasn't created");
  return { id, slug: product.slug };
}
