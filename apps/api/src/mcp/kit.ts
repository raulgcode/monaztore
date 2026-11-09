import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { minorToPrice } from "@monaztore/contracts";
import {
  type AiCaller,
  DomainError,
  listStoreDomains,
  NotFoundError,
  resolveTenant,
  type TenantContext,
} from "@monaztore/core";
import type { Mailer } from "@monaztore/email";
import { createTranslator } from "@monaztore/i18n";
import { dictionaries, type Messages } from "@monaztore/i18n/messages";
import { z } from "zod";
import { $ZodError } from "zod/v4/core";

// What every tool module shares. A module is a file in `tools/` that exports a `register`
// function (`ToolModule`); server.ts lists them. Each tool is a thin layer over a use case of
// @monaztore/core: it resolves the store from its slug with the caller's membership, checks the
// role like the workspace does, and answers in JSON the assistant explains to the person.

/** Thrown inside a tool: the assistant gets the message and can tell the person or retry. */
export class ToolError extends Error {}

export interface McpDeps {
  /** The web (APP_URL): links to the workspace. */
  appUrl: string;
  /** Emails a tool sends, like the workspace does (the downloads link of a paid order). */
  mailer?: Mailer;
}

export interface Kit {
  caller: AiCaller;
  deps: McpDeps;
  /** A link to the store's workspace: `/app/<slug><path>`. */
  workspace(slug: string, path?: string): string;
  /**
   * The store in the slug, if the caller is on its team; with `owner`, only for its owners
   * (what the workspace lets only owners do: coupons, pages, design, domains, payments…).
   */
  tenantFor(slug: string, options?: { owner?: boolean }): Promise<TenantContext>;
  /** The store's main address (`https://shop.com`), or null before it has a domain. */
  storeUrl(tenant: TenantContext): Promise<string | null>;
  /** Runs a tool, turning the domain's and the schemas' errors into a message for the assistant. */
  tool<A>(run: (args: A) => Promise<CallToolResult>): (args: A) => Promise<CallToolResult>;
}

/** A file of `tools/`: registers its feature's tools. */
export type ToolModule = (server: McpServer, kit: Kit) => void;

export const json = (value: unknown): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
});

const failure = (text: string): CallToolResult => ({
  isError: true,
  content: [{ type: "text", text }],
});

/** The schemas' errors are i18n keys: the assistant reads them in English. */
const t = createTranslator<Messages>("en", dictionaries.en) as (key: string) => string;
const issuesOf = (error: $ZodError) =>
  error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${t(issue.message)}`).join("\n");

/** Only reads. */
export const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;
/** A change the person can undo from the workspace (save it again, turn it back on). */
export const change = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
/** It can't be taken back (a delete, a cancelled order), or it reaches shoppers (an email). */
export const destructive = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
} as const;

/** Every tool names its store the same way. */
export const storeArg = z
  .string()
  .min(1)
  .describe("The store's slug, from list_stores (e.g. my-shop-k3x9)");

/** A price as people write it ("5000", "12.50"), in the store's currency. */
export const priceArg = z
  .string()
  .regex(/^\d{1,10}([.,]\d{1,2})?$/)
  .describe("A price in the store's currency, like 5000 or 12.50");

/** Minor units (cents) as the price people read, for the assistant: 500050 → "5000.50". */
export const money = (minor: number | null | undefined) =>
  minor === null || minor === undefined ? null : minorToPrice(minor);

export function createKit(caller: AiCaller, deps: McpDeps): Kit {
  const workspace = (slug: string, path = "") =>
    new URL(`/app/${slug}${path}`, deps.appUrl).toString();

  async function tenantFor(slug: string, { owner = false } = {}): Promise<TenantContext> {
    const tenant = await resolveTenant(caller.db, caller.userId, slug);
    // Like the workspace's 404: a store they aren't on the team of doesn't exist for them.
    if (!tenant) throw new ToolError(`No store "${slug}" for this person. Call list_stores.`);
    if (owner && tenant.role !== "owner") {
      throw new ToolError("Only the store's owners can do this; ask an owner.");
    }
    return tenant;
  }

  async function storeUrl(tenant: TenantContext): Promise<string | null> {
    const domains = await listStoreDomains(tenant);
    const primary = domains.find((domain) => domain.primary) ?? domains[0];
    if (!primary) return null;
    const local = primary.hostname === "localhost" || primary.hostname.endsWith(".localhost");
    if (!local) return `https://${primary.hostname}`;
    const app = new URL(deps.appUrl);
    return `${app.protocol}//${primary.hostname}${app.port ? `:${app.port}` : ""}`;
  }

  const tool =
    <A>(run: (args: A) => Promise<CallToolResult>) =>
    async (args: A): Promise<CallToolResult> => {
      try {
        return await run(args);
      } catch (error) {
        if (error instanceof $ZodError) return failure(issuesOf(error));
        if (
          error instanceof ToolError ||
          error instanceof NotFoundError ||
          error instanceof DomainError
        ) {
          return failure(error.message);
        }
        throw error;
      }
    };

  return { caller, deps, workspace, tenantFor, storeUrl, tool };
}
