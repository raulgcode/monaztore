import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AiCaller } from "@monaztore/core";
import { project } from "@monaztore/env/project";
import { createKit, type McpDeps, type ToolModule } from "./kit";
import { registerCategoryTools } from "./tools/categories";
import { registerCouponTools } from "./tools/coupons";
import { registerDesignTools } from "./tools/design";
import { registerDigitalProductTools } from "./tools/digital-products";
import { registerInvoicingTools } from "./tools/invoicing";
import { registerOrderTools } from "./tools/orders";
import { registerPageTools } from "./tools/pages";
import { registerProductTools } from "./tools/products";
import { registerStoreTools } from "./tools/stores";

/**
 * Every feature's tools, one module per workspace section. A new backend feature adds its tools
 * to its module (or a new module here) in the same change: `coverage.test.ts` fails while a use
 * case of @monaztore/core has no tool and no reason in `coverage.ts`.
 */
export const toolModules: ToolModule[] = [
  registerStoreTools,
  registerProductTools,
  registerCategoryTools,
  registerCouponTools,
  registerOrderTools,
  registerPageTools,
  registerDigitalProductTools,
  registerDesignTools,
  registerInvoicingTools,
];

export const instructions = (appUrl: string) =>
  [
    `${project.name} runs online stores. These tools act on the stores this person is on the team of, with their role in each one (owner or member), the same as the workspace at ${appUrl}.`,
    "Start with list_stores and pass the store's slug to every other tool.",
    "Prices are written as people write them (5000, 12.50) in the store's currency (get_store).",
    "Before any change, show the person what you'll do and ask; before deleting, cancelling, confirming a payment or issuing an invoice, ask again: those can't be undone.",
    "Photos, digital files and Hacienda's credentials are uploaded in the workspace: give the person the workspace link a tool returns.",
    "Reply in the person's language.",
  ].join("\n");

/**
 * The MCP server for one call: stateless, so any machine answers any call. Each tool resolves
 * the store from its slug with the caller's membership, never from the token.
 */
export function createMcpServer(caller: AiCaller, deps: McpDeps): McpServer {
  const server = new McpServer(
    {
      name: project.slug,
      title: project.name,
      version: "1.0.0",
      websiteUrl: deps.appUrl,
    },
    { instructions: instructions(deps.appUrl) },
  );
  const kit = createKit(caller, deps);
  for (const register of toolModules) register(server, kit);
  return server;
}
