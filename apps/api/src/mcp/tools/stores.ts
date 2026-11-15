import { randomUUID } from "node:crypto";
import {
  domainSchema,
  paymentSettingsSchema,
  paymentsFromForm,
  SHIPPING_METHODS_MAX,
  shippingFromForm,
  shippingSettingsSchema,
  storeLocaleSchema,
} from "@monaztore/contracts";
import {
  addStoreDomain,
  catalogSettings,
  countEinvoicesToReview,
  countOrdersToReview,
  getStoreLocale,
  getStorePayments,
  getStoreShipping,
  getWorkspace,
  listMemberships,
  listStoreDomains,
  removeStoreDomain,
  setPrimaryDomain,
  updateStoreLocale,
  updateStorePayments,
  updateStoreShipping,
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
        "A store's name, address, domains, language, currency, time zone, manual payments (SINPE Móvil, transfer), shipping options (prices in minor units) and what is waiting: orders to review and electronic invoices with a problem.",
      inputSchema: { store: storeArg },
      annotations: readOnly,
    },
    kit.tool(async ({ store }: { store: string }) => {
      const tenant = await kit.tenantFor(store);
      const [
        workspace,
        domains,
        locale,
        settings,
        payments,
        shipping,
        ordersToReview,
        einvoicesToReview,
      ] = await Promise.all([
        getWorkspace(tenant),
        listStoreDomains(tenant),
        getStoreLocale(tenant),
        catalogSettings(tenant),
        getStorePayments(tenant),
        getStoreShipping(tenant),
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
        shipping: shipping.methods,
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
        "Turns SINPE Móvil, bank transfer and cash on delivery on or off with what shoppers see (phone, bank, IBAN, holder, a note on paying on delivery). Owners only. Show the person the values and ask before saving.",
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
        cash: z
          .object({ enabled: z.boolean(), note: z.string().max(120) })
          .optional()
          .describe(
            'Cash on delivery, paid when the order arrives or is picked up (never for downloads); the note says how, like "Cash or SINPE to the courier". Left out, it stays as it is',
          ),
      },
      annotations: change,
    },
    kit.tool(
      async ({
        store,
        sinpe,
        transfer,
        cash,
      }: {
        store: string;
        sinpe: { enabled: boolean; phone: string; holder: string };
        transfer: { enabled: boolean; bank: string; iban: string; holder: string };
        cash?: { enabled: boolean; note: string };
      }) => {
        const tenant = await kit.tenantFor(store, { owner: true });
        const kept = cash ?? (await getStorePayments(tenant)).cash;
        const form = paymentSettingsSchema.parse({
          sinpeEnabled: sinpe.enabled ? "on" : undefined,
          sinpePhone: sinpe.phone,
          sinpeHolder: sinpe.holder,
          transferEnabled: transfer.enabled ? "on" : undefined,
          transferBank: transfer.bank,
          transferIban: transfer.iban,
          transferHolder: transfer.holder,
          cashEnabled: kept?.enabled ? "on" : undefined,
          cashNote: kept?.note ?? "",
        });
        await updateStorePayments(tenant, paymentsFromForm(form));
        return json({ saved: true, payments: await getStorePayments(tenant) });
      },
    ),
  );

  server.registerTool(
    "set_store_shipping",
    {
      title: "Set the store's shipping options",
      description: `Replaces the shipping options shoppers pick from at checkout (up to ${SHIPPING_METHODS_MAX}), in order: each with its name, its price, optionally an amount from which it's free, and whether it's picked up at the store (no address asked). An empty list charges nothing for shipping. Prices are written as the person says them ("2500", "12.50"), in the store's currency. Keep the id of an option that stays (from get_store) and leave it out for a new one. Owners only. Show the person the whole list and ask before saving.`,
      inputSchema: {
        store: storeArg,
        methods: z
          .array(
            z.object({
              id: z
                .string()
                .max(40)
                .optional()
                .describe("The id of an existing option; none for a new one"),
              name: z.string().max(60).describe('What shoppers read: "Correos de Costa Rica"'),
              price: z.string().max(20).describe('Its price, like "2500"; "0" for free'),
              freeFrom: z
                .string()
                .max(20)
                .optional()
                .describe("Free when the cart (after its coupon) reaches this amount"),
              pickup: z.boolean().optional().describe("Picked up at the store: no address"),
            }),
          )
          .max(SHIPPING_METHODS_MAX),
      },
      annotations: change,
    },
    kit.tool(
      async ({
        store,
        methods,
      }: {
        store: string;
        methods: {
          id?: string;
          name: string;
          price: string;
          freeFrom?: string;
          pickup?: boolean;
        }[];
      }) => {
        const tenant = await kit.tenantFor(store, { owner: true });
        const form = shippingSettingsSchema.parse({
          methods: methods.map((method) => ({
            id: method.id ?? "",
            name: method.name,
            price: method.price,
            freeFrom: method.freeFrom ?? "",
            pickup: method.pickup ? "on" : "",
          })),
        });
        await updateStoreShipping(tenant, shippingFromForm(form, randomUUID));
        return json({ saved: true, shipping: (await getStoreShipping(tenant)).methods });
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
