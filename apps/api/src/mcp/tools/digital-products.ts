import { DOWNLOAD_DAYS_MAX, DOWNLOAD_LIMIT_MAX, downloadRulesSchema } from "@monaztore/contracts";
import {
  findProductsWithoutFiles,
  getDigitalProduct,
  listDigitalProducts,
  removeProductFile,
  setDownloadRules,
} from "@monaztore/core";
import { z } from "zod";
import {
  change,
  destructive,
  json,
  money,
  readOnly,
  storeArg,
  ToolError,
  type ToolModule,
} from "../kit";

const productId = z.uuid().describe("The product's id, from list_digital_products");

/**
 * Digital products (a product with files the buyer downloads once paid). The files themselves
 * are uploaded in the workspace (Store → Digital products): up to 50 MB don't travel in a chat.
 */
export const registerDigitalProductTools: ToolModule = (server, kit) => {
  server.registerTool(
    "list_digital_products",
    {
      title: "List digital products",
      description:
        "The products that deliver files, with how many files and their download rules (downloads per file and unit, days; null is no limit).",
      inputSchema: { store: storeArg },
      annotations: readOnly,
    },
    kit.tool(async ({ store }: { store: string }) => {
      const tenant = await kit.tenantFor(store);
      const products = await listDigitalProducts(tenant);
      return json({
        products: products.map((product) => ({ ...product, price: money(product.price) })),
        upload: kit.workspace(store, "/downloads"),
      });
    }),
  );

  server.registerTool(
    "get_digital_product",
    {
      title: "See a digital product",
      description: "Its files (name and size) and download rules.",
      inputSchema: { store: storeArg, productId },
      annotations: readOnly,
    },
    kit.tool(async ({ store, productId: id }: { store: string; productId: string }) => {
      const tenant = await kit.tenantFor(store);
      const product = await getDigitalProduct(tenant, id);
      if (!product) throw new ToolError(`No digital product ${id} in this store.`);
      return json({
        product: { ...product, price: money(product.price) },
        workspace: kit.workspace(store, `/downloads/${id}`),
      });
    }),
  );

  server.registerTool(
    "find_products_without_files",
    {
      title: "Find products to make digital",
      description:
        "Products the store already sells with no files yet, by name: the person adds a file to one in the workspace.",
      inputSchema: { store: storeArg, q: z.string().max(100) },
      annotations: readOnly,
    },
    kit.tool(async ({ store, q }: { store: string; q: string }) => {
      const tenant = await kit.tenantFor(store);
      return json({ products: await findProductsWithoutFiles(tenant, q) });
    }),
  );

  server.registerTool(
    "set_download_rules",
    {
      title: "Set the download rules",
      description: `How many times each file can be downloaded per unit bought (up to ${DOWNLOAD_LIMIT_MAX}) and for how many days after paying (up to ${DOWNLOAD_DAYS_MAX}); null is no limit. Orders already paid keep theirs. Owners only.`,
      inputSchema: {
        store: storeArg,
        productId,
        downloadLimit: z.number().int().min(1).max(DOWNLOAD_LIMIT_MAX).nullable(),
        downloadDays: z.number().int().min(1).max(DOWNLOAD_DAYS_MAX).nullable(),
      },
      annotations: change,
    },
    kit.tool(
      async ({
        store,
        productId: id,
        downloadLimit,
        downloadDays,
      }: {
        store: string;
        productId: string;
        downloadLimit: number | null;
        downloadDays: number | null;
      }) => {
        const tenant = await kit.tenantFor(store, { owner: true });
        const rules = downloadRulesSchema.parse({
          downloadLimit: downloadLimit === null ? "" : String(downloadLimit),
          downloadDays: downloadDays === null ? "" : String(downloadDays),
        });
        await setDownloadRules(tenant, id, rules);
        return json({ saved: true, ...rules });
      },
    ),
  );

  server.registerTool(
    "remove_product_file",
    {
      title: "Remove a file from a product",
      description:
        "New buyers stop getting it; those who already bought it keep their copy. Owners only. Ask before removing it.",
      inputSchema: {
        store: storeArg,
        productId,
        fileId: z.uuid().describe("From get_digital_product"),
      },
      annotations: destructive,
    },
    kit.tool(
      async ({
        store,
        productId: id,
        fileId,
      }: {
        store: string;
        productId: string;
        fileId: string;
      }) => {
        const tenant = await kit.tenantFor(store, { owner: true });
        await removeProductFile(tenant, id, fileId);
        return json({ removed: true });
      },
    ),
  );
};
