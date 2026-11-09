import {
  domainSchema,
  paymentSettingsSchema,
  paymentsFromForm,
  storeLocaleSchema,
} from "@monaztore/contracts";
import {
  addStoreDomain,
  catalogSettings,
  countEinvoicesToReview,
  countOrdersToReview,
  getStoreLocale,
  getStorePayments,
  getWorkspace,
  listMemberships,
  listStoreDomains,
  removeStoreDomain,
  setPrimaryDomain,
  updateStoreLocale,
  updateStorePayments,
} from "@monaztore/core";
import { locales } from "@monaztore/i18n";
import { z } from "zod";
import { change, destructive, json, readOnly, storeArg, type ToolModule } from "../kit";

/** The stores the person is on the team of, and each store's settings (Store in the workspace). */
export const registerStoreTools: ToolModule = (server, kit) => {
  server.registerTool(
    "list_stores",
    {
      title: "List my stores",
      description:
        "The stores this person is on the team of, with their role (owner or member). Every other tool takes one of these slugs.",
      inputSchema: {},
      annotations: readOnly,
    },
    kit.tool(async () => {
      const memberships = await listMemberships(kit.caller.db, kit.caller.userId);
      return json({
        stores: memberships.map(({ name, slug, role }) => ({
          name,
          slug,
          role,
          workspace: kit.workspace(slug),
        })),
      });
    }),
  );

  server.registerTool(
    "get_store",
    {
      title: "See a store",
      description:
        "A store's name, address, domains, language, currency, time zone, manual payments (SINPE Móvil, transfer) and what is waiting: orders to review and electronic invoices with a problem.",
      inputSchema: { store: storeArg },
      annotations: readOnly,
    },
    kit.tool(async ({ store }: { store: string }) => {
      const tenant = await kit.tenantFor(store);
      const [workspace, domains, locale, settings, payments, ordersToReview, einvoicesToReview] =
        await Promise.all([
          getWorkspace(tenant),
          listStoreDomains(tenant),
          getStoreLocale(tenant),
          catalogSettings(tenant),
          getStorePayments(tenant),
          countOrdersToReview(tenant),
          countEinvoicesToReview(tenant),
        ]);
      return json({
        ...workspace,
        role: tenant.role,
        url: await kit.storeUrl(tenant),
        domains,
        locale,
        currency: settings.currency,
        timeZone: settings.timeZone,
        payments,
        ordersToReview,
        einvoicesToReview,
        workspace: kit.workspace(store),
      });
    }),
  );

  server.registerTool(
    "set_store_payments",
    {
      title: "Set how the store gets paid",
      description:
        "Turns SINPE Móvil and bank transfer on or off with what shoppers see (phone, bank, IBAN, holder). Owners only. Show the person the values and ask before saving.",
      inputSchema: {
        store: storeArg,
        sinpe: z
          .object({ enabled: z.boolean(), phone: z.string().max(20), holder: z.string().max(80) })
          .describe("SINPE Móvil: the phone and whose name it is in"),
        transfer: z
          .object({
            enabled: z.boolean(),
            bank: z.string().max(80),
            iban: z.string().max(34),
            holder: z.string().max(80),
          })
          .describe("Bank transfer: the bank, the IBAN and whose name it is in"),
      },
      annotations: change,
    },
    kit.tool(
      async ({
        store,
        sinpe,
        transfer,
      }: {
        store: string;
        sinpe: { enabled: boolean; phone: string; holder: string };
        transfer: { enabled: boolean; bank: string; iban: string; holder: string };
      }) => {
        const tenant = await kit.tenantFor(store, { owner: true });
        const form = paymentSettingsSchema.parse({
          sinpeEnabled: sinpe.enabled ? "on" : undefined,
          sinpePhone: sinpe.phone,
          sinpeHolder: sinpe.holder,
          transferEnabled: transfer.enabled ? "on" : undefined,
          transferBank: transfer.bank,
          transferIban: transfer.iban,
          transferHolder: transfer.holder,
        });
        await updateStorePayments(tenant, paymentsFromForm(form));
        return json({ saved: true, payments: await getStorePayments(tenant) });
      },
    ),
  );

  server.registerTool(
    "set_store_language",
    {
      title: "Set the store's language",
      description: `The language shoppers see by default (${locales.join(", ")}). Owners only.`,
      inputSchema: { store: storeArg, locale: z.enum(locales) },
      annotations: change,
    },
    kit.tool(async ({ store, locale }: { store: string; locale: string }) => {
      const tenant = await kit.tenantFor(store, { owner: true });
      const input = storeLocaleSchema.parse({ locale });
      await updateStoreLocale(tenant, input.locale);
      return json({ saved: true, locale: input.locale });
    }),
  );

  server.registerTool(
    "add_store_domain",
    {
      title: "Connect a domain",
      description:
        "Connects a domain (myshop.com, without https://) to the store; with primary, it becomes the main one. The person still points the domain's DNS at the platform. Owners only.",
      inputSchema: {
        store: storeArg,
        hostname: z.string().min(1).max(253),
        primary: z.boolean().optional(),
      },
      annotations: change,
    },
    kit.tool(
      async ({
        store,
        hostname,
        primary,
      }: {
        store: string;
        hostname: string;
        primary?: boolean;
      }) => {
        const tenant = await kit.tenantFor(store, { owner: true });
        const input = domainSchema.parse({ hostname });
        const added = await addStoreDomain(tenant, input.hostname, { primary: primary ?? false });
        return json({ added: added.hostname, domains: await listStoreDomains(tenant) });
      },
    ),
  );

  server.registerTool(
    "set_primary_domain",
    {
      title: "Make a domain the main one",
      description:
        "The store's pages point to their main domain (canonical links, emails). Owners only.",
      inputSchema: { store: storeArg, hostname: z.string().min(1).max(253) },
      annotations: change,
    },
    kit.tool(async ({ store, hostname }: { store: string; hostname: string }) => {
      const tenant = await kit.tenantFor(store, { owner: true });
      await setPrimaryDomain(tenant, hostname.trim().toLowerCase());
      return json({ domains: await listStoreDomains(tenant) });
    }),
  );

  server.registerTool(
    "remove_store_domain",
    {
      title: "Disconnect a domain",
      description:
        "The store stops answering on that domain. Owners only. Ask before removing it: shoppers' links to it stop working.",
      inputSchema: { store: storeArg, hostname: z.string().min(1).max(253) },
      annotations: destructive,
    },
    kit.tool(async ({ store, hostname }: { store: string; hostname: string }) => {
      const tenant = await kit.tenantFor(store, { owner: true });
      await removeStoreDomain(tenant, hostname.trim().toLowerCase());
      return json({ domains: await listStoreDomains(tenant) });
    }),
  );
};
