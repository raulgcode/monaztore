import { categoryFormSchema } from "@monaztore/contracts";
import { createCategory, deleteCategory, listCategories, renameCategory } from "@monaztore/core";
import { z } from "zod";
import { change, destructive, json, readOnly, storeArg, type ToolModule } from "../kit";

const categoryId = z.uuid().describe("The category's id, from list_categories");

/**
 * The catalog's categories (Categories in the workspace). Each store may call them its own way
 * in its design (`categoriesLabel`, e.g. "Designs").
 */
export const registerCategoryTools: ToolModule = (server, kit) => {
  server.registerTool(
    "list_categories",
    {
      title: "List categories",
      description:
        "The store's categories (collections), parents before their children, with how many products each has.",
      inputSchema: { store: storeArg },
      annotations: readOnly,
    },
    kit.tool(async ({ store }: { store: string }) => {
      const tenant = await kit.tenantFor(store);
      return json({ categories: await listCategories(tenant) });
    }),
  );

  server.registerTool(
    "create_category",
    {
      title: "Create a category",
      description: "A new category, optionally inside another one (parentId).",
      inputSchema: {
        store: storeArg,
        name: z.string().min(1).max(80),
        parentId: z.uuid().optional(),
      },
      annotations: { ...change, idempotentHint: false },
    },
    kit.tool(async ({ store, ...input }: { store: string; name: string; parentId?: string }) => {
      const tenant = await kit.tenantFor(store);
      const category = await createCategory(tenant, categoryFormSchema.parse(input));
      return json({ category });
    }),
  );

  server.registerTool(
    "rename_category",
    {
      title: "Rename a category",
      description: "Changes the name a category shows in the store.",
      inputSchema: { store: storeArg, categoryId, name: z.string().min(1).max(80) },
      annotations: change,
    },
    kit.tool(
      async ({
        store,
        categoryId: id,
        name,
      }: {
        store: string;
        categoryId: string;
        name: string;
      }) => {
        const tenant = await kit.tenantFor(store);
        await renameCategory(tenant, id, categoryFormSchema.parse({ name }).name);
        return json({ renamed: true });
      },
    ),
  );

  server.registerTool(
    "delete_category",
    {
      title: "Delete a category",
      description:
        "Removes the category; its products stay, without it. Ask before deleting: it can't be undone.",
      inputSchema: { store: storeArg, categoryId },
      annotations: destructive,
    },
    kit.tool(async ({ store, categoryId: id }: { store: string; categoryId: string }) => {
      const tenant = await kit.tenantFor(store);
      await deleteCategory(tenant, id);
      return json({ deleted: true });
    }),
  );
};
