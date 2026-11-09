import {
  BULK_PRODUCTS_MAX,
  bulkProductActions,
  bulkProductsSchema,
  dayOf,
  formPricesOf,
  minorToPrice,
  type ProductListQuery,
  productFormSchema,
  productInputOf,
  productListStatuses,
  productSorts,
  productStockFilters,
} from "@monaztore/contracts";
import {
  bulkUpdateProducts,
  catalogSettings,
  duplicateProduct,
  type EditableProduct,
  getEditableProduct,
  listAttributeNames,
  listProducts,
  saveProduct,
  searchProducts,
} from "@monaztore/core";
import { z } from "zod";
import {
  change,
  destructive,
  json,
  money,
  priceArg,
  readOnly,
  storeArg,
  ToolError,
  type ToolModule,
} from "../kit";

const productId = z.uuid().describe("The product's id, from list_products");
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("YYYY-MM-DD, in the store's time zone");

const variantArg = z.object({
  id: z.uuid().optional().describe("Keep it to update an existing variant (from get_product)"),
  options: z
    .record(z.string(), z.string())
    .describe('One value per option the shopper chooses, e.g. { "Size": "M" }'),
  sku: z.string().max(64).optional(),
  regularPrice: priceArg.optional(),
  offerPrice: priceArg.optional(),
  stock: z.number().int().min(0).optional().describe("Units left, when the product counts stock"),
  inStock: z.boolean().optional(),
  imageUrl: z.string().optional().describe("One of the product's own photo urls"),
});

/** Everything the product editor has, each part optional: what's left out stays as it is. */
const productFields = {
  name: z.string().min(1).max(200).optional(),
  slug: z
    .string()
    .max(120)
    .optional()
    .describe("Its address: /products/<slug>. Changing a published one leaves a 301."),
  status: z
    .enum(["active", "draft", "archived"])
    .optional()
    .describe("active: in the store; draft: hidden while it's prepared; archived: hidden"),
  description: z.string().max(50_000).optional().describe("HTML; it is cleaned before showing"),
  shortDescription: z.string().max(1000).optional(),
  regularPrice: z
    .union([priceArg, z.literal("")])
    .optional()
    .describe("What it sells for; empty takes it away"),
  offerPrice: z
    .union([priceArg, z.literal("")])
    .optional()
    .describe("Lower than regularPrice while the offer runs; empty ends the offer"),
  saleFrom: z
    .union([day, z.literal("")])
    .optional()
    .describe("The offer's first day"),
  saleTo: z
    .union([day, z.literal("")])
    .optional()
    .describe("The offer's last day"),
  sku: z.string().max(64).optional().describe("Unique in the store"),
  stock: z
    .number()
    .int()
    .min(0)
    .nullable()
    .optional()
    .describe("Units left (the store counts stock); null stops counting"),
  available: z.boolean().optional().describe("When stock isn't counted: whether it can be bought"),
  weightGrams: z.number().int().min(0).max(999_999).nullable().optional(),
  seoTitle: z.string().max(70).optional(),
  seoDescription: z.string().max(160).optional(),
  categoryIds: z.array(z.uuid()).optional().describe("Its categories, from list_categories"),
  images: z
    .array(z.object({ url: z.string(), alt: z.string().max(200) }))
    .max(20)
    .optional()
    .describe(
      "Its photos in order, the first is the cover: only urls the product already has (get_product). New photos are uploaded in the workspace.",
    ),
  attributes: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        values: z.array(z.string().min(1).max(60)).min(1).max(50),
        variation: z
          .boolean()
          .describe("true: the shopper chooses it and it makes the variants (up to 3)"),
      }),
    )
    .max(10)
    .optional()
    .describe("Options and details (Size, Color, Material); they are also the store's filters"),
  variants: z
    .array(variantArg)
    .max(100)
    .optional()
    .describe("One per combination of the variation attributes, replacing the current ones"),
};
type ProductFields = {
  [K in keyof typeof productFields]?: z.infer<(typeof productFields)[K]>;
};

const price = (minor: number | null) => (minor === null ? "" : minorToPrice(minor));

/** The editor's form for a saved product (or a new one), as the workspace fills it. */
function formOf(product: EditableProduct | undefined, timeZone: string) {
  const prices = formPricesOf(product?.price ?? null, product?.compareAtPrice ?? null);
  const tracked = product
    ? product.stockQuantity !== null || product.variants.some((v) => v.stockQuantity !== null)
    : false;
  return {
    name: product?.name ?? "",
    slug: product?.slug ?? "",
    status: product?.status ?? "draft",
    description: product?.description ?? "",
    shortDescription: product?.shortDescription ?? "",
    regularPrice: price(prices.regular),
    offerPrice: price(prices.offer),
    saleFrom: product?.saleStartsAt ? dayOf(product.saleStartsAt, timeZone) : "",
    saleTo: product?.saleEndsAt ? dayOf(product.saleEndsAt, timeZone, { endOfDay: true }) : "",
    timeZone,
    sku: product?.sku ?? "",
    trackStock: tracked ? "on" : "",
    stock: product?.stockQuantity == null ? "" : String(product.stockQuantity),
    available: product?.inStock === false ? "no" : "yes",
    weight: product?.weightGrams == null ? "" : String(product.weightGrams),
    seoTitle: product?.seoTitle ?? "",
    seoDescription: product?.seoDescription ?? "",
    categoryIds: product?.categoryIds ?? [],
    images: product?.images ?? [],
    attributes: product?.attributes ?? [],
    variants: (product?.variants ?? []).map((variant) => {
      const { regular, offer } = formPricesOf(variant.price, variant.compareAtPrice);
      return {
        id: variant.id as string | undefined,
        options: variant.options,
        sku: variant.sku ?? "",
        price: price(regular),
        offerPrice: price(offer),
        stock: variant.stockQuantity === null ? "" : String(variant.stockQuantity),
        inStock: variant.inStock,
        imageUrl: variant.imageUrl ?? "",
      };
    }),
  };
}

/** The changes on top of the form, then the editor's own schema: the same checks as the workspace. */
function applyChanges(form: ReturnType<typeof formOf>, changes: ProductFields) {
  const next = { ...form };
  const text = <K extends keyof typeof next>(key: K, value: (typeof next)[K] | undefined) => {
    if (value !== undefined) next[key] = value;
  };
  text("name", changes.name);
  text("slug", changes.slug);
  text("status", changes.status);
  text("description", changes.description);
  text("shortDescription", changes.shortDescription);
  text("regularPrice", changes.regularPrice);
  text("offerPrice", changes.offerPrice);
  text("saleFrom", changes.saleFrom);
  text("saleTo", changes.saleTo);
  text("sku", changes.sku);
  text("seoTitle", changes.seoTitle);
  text("seoDescription", changes.seoDescription);
  text("categoryIds", changes.categoryIds);
  text("images", changes.images);
  text("attributes", changes.attributes);
  if (changes.stock !== undefined) {
    next.trackStock = changes.stock === null ? "" : "on";
    next.stock = changes.stock === null ? "" : String(changes.stock);
  }
  if (changes.available !== undefined) next.available = changes.available ? "yes" : "no";
  if (changes.weightGrams !== undefined) {
    next.weight = changes.weightGrams === null ? "" : String(changes.weightGrams);
  }
  if (changes.variants !== undefined) {
    next.variants = changes.variants.map((variant) => ({
      id: variant.id,
      options: variant.options,
      sku: variant.sku ?? "",
      price: variant.regularPrice ?? "",
      offerPrice: variant.offerPrice ?? "",
      stock: variant.stock === undefined ? "" : String(variant.stock),
      inStock: variant.inStock ?? true,
      imageUrl: variant.imageUrl ?? "",
    }));
    if (changes.variants.some((variant) => variant.stock !== undefined)) next.trackStock = "on";
  }
  return productFormSchema.parse({
    ...next,
    images: JSON.stringify(next.images),
    attributes: JSON.stringify(next.attributes),
    variants: JSON.stringify(next.variants),
  });
}

/** A saved product for the assistant: prices as people read them, dates as days. */
function productView(product: EditableProduct, timeZone: string, workspaceLink: string) {
  const form = formOf(product, timeZone);
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    status: product.status,
    regularPrice: form.regularPrice || null,
    offerPrice: form.offerPrice || null,
    saleFrom: form.saleFrom || null,
    saleTo: form.saleTo || null,
    sku: product.sku,
    stock: product.stockQuantity,
    available: product.inStock,
    weightGrams: product.weightGrams,
    shortDescription: product.shortDescription,
    description: product.description,
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    categoryIds: product.categoryIds,
    images: product.images,
    attributes: product.attributes,
    variants: form.variants.map(({ price: regularPrice, ...variant }) => ({
      ...variant,
      regularPrice: regularPrice || null,
      offerPrice: variant.offerPrice || null,
      stock: variant.stock === "" ? null : Number(variant.stock),
    })),
    digitalFiles: product.files,
    workspace: workspaceLink,
  };
}

/** The catalog (Products in the workspace): the list, the editor and the bulk bar. */
export const registerProductTools: ToolModule = (server, kit) => {
  const link = (store: string, id: string) => kit.workspace(store, `/products/${id}`);

  server.registerTool(
    "list_products",
    {
      title: "List products",
      description:
        "The store's catalog, 25 per page, with search, status, stock and category filters and an order. Prices are in the store's currency (get_store).",
      inputSchema: {
        store: storeArg,
        q: z.string().max(100).optional().describe("Words of the name or the SKU"),
        status: z.enum(productListStatuses).optional(),
        stock: z.enum(productStockFilters).optional().describe("in, out, or low (5 or fewer left)"),
        category: z.uuid().optional().describe("A category's id, from list_categories"),
        sort: z.enum(productSorts).optional(),
        page: z.number().int().min(1).optional(),
      },
      annotations: readOnly,
    },
    kit.tool(async ({ store, ...filters }: { store: string } & Partial<ProductListQuery>) => {
      const tenant = await kit.tenantFor(store);
      const list = await listProducts(tenant, {
        q: (filters.q ?? "").trim(),
        status: filters.status ?? "all",
        stock: filters.stock ?? "all",
        category: filters.category ?? "",
        sort: filters.sort ?? "newest",
        page: filters.page ?? 1,
      });
      return json({
        ...list,
        products: list.products.map((product) => ({
          id: product.id,
          name: product.name,
          slug: product.slug,
          status: product.status,
          sku: product.sku,
          price: money(product.price),
          regularPrice: money(product.regularPrice),
          onSale: product.onSale,
          inStock: product.inStock,
          stock: product.stock,
          variants: product.variants,
          digital: product.digital,
          categories: product.categories,
          updatedAt: product.updatedAt,
        })),
      });
    }),
  );

  server.registerTool(
    "find_products",
    {
      title: "Find products by name",
      description: "A short list of products whose name or SKU matches, to pick one by id.",
      inputSchema: { store: storeArg, q: z.string().min(1).max(100) },
      annotations: readOnly,
    },
    kit.tool(async ({ store, q }: { store: string; q: string }) => {
      const tenant = await kit.tenantFor(store);
      return json({ products: await searchProducts(tenant, q) });
    }),
  );

  server.registerTool(
    "get_product",
    {
      title: "See a product",
      description:
        "Everything the product editor shows: prices and offer, stock, SKU, options and variants, categories, photos and SEO.",
      inputSchema: { store: storeArg, productId },
      annotations: readOnly,
    },
    kit.tool(async ({ store, productId: id }: { store: string; productId: string }) => {
      const tenant = await kit.tenantFor(store);
      const [product, settings] = await Promise.all([
        getEditableProduct(tenant, id),
        catalogSettings(tenant),
      ]);
      if (!product) throw new ToolError(`No product ${id} in this store. Call list_products.`);
      return json({
        product: productView(product, settings.timeZone, link(store, id)),
        currency: settings.currency,
      });
    }),
  );

  server.registerTool(
    "list_product_options",
    {
      title: "List the options in use",
      description:
        "The option names the store's products already use (Size, Color…) with their values, to reuse the same spelling.",
      inputSchema: { store: storeArg },
      annotations: readOnly,
    },
    kit.tool(async ({ store }: { store: string }) => {
      const tenant = await kit.tenantFor(store);
      return json({ options: await listAttributeNames(tenant) });
    }),
  );

  server.registerTool(
    "save_product",
    {
      title: "Create or change a product",
      description:
        "Without productId it creates one (a draft unless status says otherwise); with it, changes only the fields given, like saving the editor. Prices are in the store's currency. Show the person what will change and ask before saving.",
      inputSchema: { store: storeArg, productId: productId.optional(), ...productFields },
      annotations: change,
    },
    kit.tool(
      async ({
        store,
        productId: id,
        ...changes
      }: { store: string; productId?: string } & ProductFields) => {
        const tenant = await kit.tenantFor(store);
        const settings = await catalogSettings(tenant);
        const current = id ? await getEditableProduct(tenant, id) : undefined;
        if (id && !current) throw new ToolError(`No product ${id} in this store.`);
        if (!id && !changes.name) throw new ToolError("A new product needs a name.");
        const form = applyChanges(formOf(current, settings.timeZone), changes);
        const saved = await saveProduct(tenant, id ?? null, productInputOf(form));
        const product = await getEditableProduct(tenant, saved);
        if (!product) throw new ToolError("The product was saved but can't be read back.");
        return json({
          saved: true,
          product: productView(product, settings.timeZone, link(store, saved)),
        });
      },
    ),
  );

  server.registerTool(
    "duplicate_product",
    {
      title: "Duplicate a product",
      description: "A draft copy of the product, to make a similar one.",
      inputSchema: { store: storeArg, productId },
      annotations: { ...change, idempotentHint: false },
    },
    kit.tool(async ({ store, productId: id }: { store: string; productId: string }) => {
      const tenant = await kit.tenantFor(store);
      const copy = await duplicateProduct(tenant, id);
      return json({ productId: copy, workspace: link(store, copy) });
    }),
  );

  server.registerTool(
    "bulk_update_products",
    {
      title: "Change many products at once",
      description: `Up to ${BULK_PRODUCTS_MAX} products: publish, draft, archive (hide), delete, addCategory (with categoryId) or offer (percent off the regular price; 0 ends the offer). Ask before running it, and twice for delete: it can't be undone.`,
      inputSchema: {
        store: storeArg,
        action: z.enum(bulkProductActions),
        productIds: z.array(z.uuid()).min(1).max(BULK_PRODUCTS_MAX),
        categoryId: z.uuid().optional(),
        percent: z.number().int().min(0).max(90).optional(),
      },
      annotations: destructive,
    },
    kit.tool(
      async ({
        store,
        action,
        productIds,
        categoryId,
        percent,
      }: {
        store: string;
        action: (typeof bulkProductActions)[number];
        productIds: string[];
        categoryId?: string;
        percent?: number;
      }) => {
        const tenant = await kit.tenantFor(store);
        const input = bulkProductsSchema.parse({ action, ids: productIds, categoryId, percent });
        if (input.action === "addCategory" && !input.categoryId) {
          throw new ToolError("addCategory needs categoryId.");
        }
        if (input.action === "offer" && input.percent === undefined) {
          throw new ToolError("offer needs percent.");
        }
        const changed = await bulkUpdateProducts(tenant, input);
        return json({ changed });
      },
    ),
  );
};
