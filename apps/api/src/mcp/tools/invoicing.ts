import {
  einvoicingIssuerSchema,
  einvoicingOptionsSchema,
  einvoicingProductSchema,
  invoiceToSchema,
  taxIdFromForm,
} from "@monaztore/contracts";
import {
  getEinvoicing,
  hitRateLimit,
  issueOrderEinvoice,
  listEinvoices,
  retryEinvoice,
  saveEinvoicingIssuer,
  saveEinvoicingOptions,
  saveEinvoicingProduct,
  setEinvoicingEnabled,
  type TenantContext,
} from "@monaztore/core";
import { findTaxpayer, searchCabys } from "@monaztore/hacienda";
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

const lookups = { limit: 60, windowMs: 15 * 60_000 };

/**
 * Costa Rica's electronic invoices (Invoicing in the workspace): only for stores in Costa Rica.
 * The ATV user, its password, the .p12 and its PIN are typed only in the workspace: secrets
 * never go through a chat.
 */
export const registerInvoicingTools: ToolModule = (server, kit) => {
  const owners = (store: string) => kit.tenantFor(store, { owner: true });
  // Hacienda's public lookups, with the workspace's own counter (`haciendaLookup`).
  const lookup = async (tenant: TenantContext) => {
    const result = await hitRateLimit(
      tenant.db,
      `haciendaLookup:${tenant.organizationId}`,
      lookups,
    );
    if (!result.allowed) throw new ToolError("Too many lookups; try again in a few minutes.");
  };

  server.registerTool(
    "get_einvoicing",
    {
      title: "See electronic invoicing",
      description:
        "Whether the store issues Hacienda's electronic invoices, which of the three steps are done (issuer, CABYS code, ATV credentials), its options and the latest documents. Only for stores in Costa Rica.",
      inputSchema: { store: storeArg },
      annotations: readOnly,
    },
    kit.tool(async ({ store }: { store: string }) => {
      const tenant = await kit.tenantFor(store);
      const settings = await getEinvoicing(tenant);
      if (!settings.available) {
        return json({
          available: false,
          note: "Electronic invoicing is only for stores in Costa Rica.",
        });
      }
      return json({ settings, workspace: kit.workspace(store, "/invoicing") });
    }),
  );

  server.registerTool(
    "list_einvoices",
    {
      title: "List electronic invoices",
      description:
        "Documents sent to Hacienda, newest first; attention lists only the rejected or failed ones.",
      inputSchema: {
        store: storeArg,
        attention: z.boolean().optional(),
        page: z.number().int().min(1).optional(),
      },
      annotations: readOnly,
    },
    kit.tool(
      async ({ store, attention, page }: { store: string; attention?: boolean; page?: number }) => {
        const tenant = await kit.tenantFor(store);
        const list = await listEinvoices(tenant, { attention, page });
        return json({
          ...list,
          einvoices: list.einvoices.map((row) => ({ ...row, total: money(row.total) })),
        });
      },
    ),
  );

  server.registerTool(
    "find_taxpayer",
    {
      title: "Look up a cédula in Hacienda",
      description:
        "The name and economic activities Hacienda has for a Costa Rican ID, to fill the issuer.",
      inputSchema: { store: storeArg, idNumber: z.string().min(9).max(12) },
      annotations: { ...readOnly, openWorldHint: true },
    },
    kit.tool(async ({ store, idNumber }: { store: string; idNumber: string }) => {
      const tenant = await owners(store);
      await lookup(tenant);
      return json({ taxpayer: (await findTaxpayer(idNumber.replace(/\D/g, ""))) ?? null });
    }),
  );

  server.registerTool(
    "search_cabys",
    {
      title: "Search Hacienda's CABYS catalog",
      description:
        'CABYS codes for words like "camiseta" or "zapatos", to pick what the store sells.',
      inputSchema: { store: storeArg, q: z.string().min(1).max(80) },
      annotations: { ...readOnly, openWorldHint: true },
    },
    kit.tool(async ({ store, q }: { store: string; q: string }) => {
      const tenant = await owners(store);
      await lookup(tenant);
      return json({ results: await searchCabys(q) });
    }),
  );

  server.registerTool(
    "save_einvoicing_issuer",
    {
      title: "Save who issues the invoices",
      description:
        "Step 1: the store's details as in Hacienda (find_taxpayer fills name and activity). district is province-canton-district like 1-02-03. Owners only.",
      inputSchema: {
        store: storeArg,
        idNumber: z.string(),
        name: z.string().max(100),
        commercialName: z.string().max(80).optional(),
        email: z.string(),
        phone: z.string().optional(),
        activityCode: z.string().describe("6 digits"),
        district: z.string().describe("1-02-03"),
        address: z.string().max(250),
      },
      annotations: change,
    },
    kit.tool(
      async ({ store, ...fields }: { store: string } & Record<string, string | undefined>) => {
        const tenant = await owners(store);
        await saveEinvoicingIssuer(tenant, einvoicingIssuerSchema.parse(fields));
        return json({ saved: true, steps: (await getEinvoicing(tenant)).steps });
      },
    ),
  );

  server.registerTool(
    "save_einvoicing_product",
    {
      title: "Save the CABYS code",
      description:
        "Step 2: one CABYS code (13 digits, from search_cabys) for everything the store sells. Owners only.",
      inputSchema: {
        store: storeArg,
        cabys: z.string().regex(/^\d{13}$/),
        cabysDescription: z.string().max(500).optional(),
      },
      annotations: change,
    },
    kit.tool(
      async ({ store, ...fields }: { store: string; cabys: string; cabysDescription?: string }) => {
        const tenant = await owners(store);
        await saveEinvoicingProduct(tenant, einvoicingProductSchema.parse(fields));
        return json({ saved: true, steps: (await getEinvoicing(tenant)).steps });
      },
    ),
  );

  server.registerTool(
    "set_einvoicing_options",
    {
      title: "Set the invoicing options",
      description:
        "autoIssue: issue each order's document as soon as it is paid; branch and terminal number the documents (another terminal keeps them apart from another system). Owners only.",
      inputSchema: {
        store: storeArg,
        autoIssue: z.boolean(),
        branch: z.number().int().min(1).max(999),
        terminal: z.number().int().min(1).max(99_999),
      },
      annotations: change,
    },
    kit.tool(
      async ({
        store,
        autoIssue,
        branch,
        terminal,
      }: {
        store: string;
        autoIssue: boolean;
        branch: number;
        terminal: number;
      }) => {
        const tenant = await owners(store);
        const input = einvoicingOptionsSchema.parse({
          autoIssue: autoIssue ? "on" : undefined,
          branch: String(branch),
          terminal: String(terminal),
        });
        await saveEinvoicingOptions(tenant, input);
        return json({ saved: true, ...input });
      },
    ),
  );

  server.registerTool(
    "set_einvoicing_enabled",
    {
      title: "Turn electronic invoicing on or off",
      description:
        "On, paid orders get their document sent to Hacienda. It needs the three steps done; the credentials are only entered in the workspace. Owners only. Ask before turning it on.",
      inputSchema: { store: storeArg, enabled: z.boolean() },
      annotations: change,
    },
    kit.tool(async ({ store, enabled }: { store: string; enabled: boolean }) => {
      const tenant = await owners(store);
      const { steps } = await getEinvoicing(tenant);
      if (enabled && !steps.credentials) {
        throw new ToolError(
          `The ATV credentials are missing: the owner enters them in ${kit.workspace(store, "/invoicing")}.`,
        );
      }
      await setEinvoicingEnabled(tenant, enabled);
      return json({ enabled });
    }),
  );

  server.registerTool(
    "issue_order_einvoice",
    {
      title: "Issue an order's electronic invoice",
      description:
        "For a paid order without a document: an invoice (01) in the name of taxIdNumber and taxName, or a receipt (04) without them. It goes to Hacienda and the buyer by email. Ask before issuing: it can't be undone.",
      inputSchema: {
        store: storeArg,
        number: z.number().int().min(1),
        taxIdNumber: z.string().optional(),
        taxName: z.string().max(100).optional(),
      },
      annotations: { ...destructive, openWorldHint: true },
    },
    kit.tool(
      async ({
        store,
        number,
        taxIdNumber,
        taxName,
      }: {
        store: string;
        number: number;
        taxIdNumber?: string;
        taxName?: string;
      }) => {
        const tenant = await kit.tenantFor(store);
        const to = invoiceToSchema.parse({
          taxIdNumber: taxIdNumber ?? "",
          taxName: taxName ?? "",
        });
        await issueOrderEinvoice(tenant, number, taxIdFromForm(to));
        return json({ queued: true });
      },
    ),
  );

  server.registerTool(
    "retry_einvoice",
    {
      title: "Send a failed invoice again",
      description:
        "After fixing what failed (credentials, the key, Hacienda unreachable): the document goes back to the queue.",
      inputSchema: { store: storeArg, einvoiceId: z.uuid().describe("From list_einvoices") },
      annotations: { ...change, openWorldHint: true },
    },
    kit.tool(async ({ store, einvoiceId }: { store: string; einvoiceId: string }) => {
      const tenant = await kit.tenantFor(store);
      await retryEinvoice(tenant, einvoiceId);
      return json({ queued: true });
    }),
  );
};
