import { orderShippedSchema } from "@monaztore/contracts";
import { formatPrice } from "@monaztore/contracts/price-format";
import {
  cancelOrder,
  type DownloadsLink,
  getOrder,
  getOrderEinvoices,
  hitRateLimit,
  listOrders,
  markOrderDelivered,
  markOrderPaid,
  markOrderShipped,
  type OrderListFilter,
  type OrderNotice,
  renewDownloadsLink,
  storeIdentity,
  storeOwnerContacts,
  type TenantContext,
} from "@monaztore/core";
import { downloadsMessage, orderUpdateMessage } from "@monaztore/email";
import { defaultLocale, parseLocale } from "@monaztore/i18n";
import { z } from "zod";
import {
  destructive,
  json,
  type Kit,
  money,
  readOnly,
  storeArg,
  ToolError,
  type ToolModule,
} from "../kit";

const orderStatuses = [
  "pending_payment",
  "payment_submitted",
  "paid",
  "cancelled",
  "to_ship",
] as const;
const orderNumber = z.number().int().min(1).describe("The order's number (#1001 is 1001)");

/** The buyer's downloads email, like the workspace sends it: false when it couldn't go out. */
async function sendDownloadsEmail(kit: Kit, tenant: TenantContext, link: DownloadsLink) {
  const { mailer } = kit.deps;
  const [store, origin] = await Promise.all([storeIdentity(tenant), kit.storeUrl(tenant)]);
  if (!mailer || !origin) return false;
  try {
    await mailer.send({
      to: link.email,
      ...downloadsMessage({
        locale: parseLocale(link.locale) ?? defaultLocale,
        storeName: store.name,
        orderNumber: link.number,
        name: link.name,
        url: `${origin}/downloads/${link.token}`,
        files: link.files,
      }),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * The shopper's email when their order moves (paid, sent, ready, cancelled), like the workspace
 * sends it: replies go to the store's first owner. False when it couldn't go out.
 */
async function sendOrderUpdate(kit: Kit, tenant: TenantContext, notice: OrderNotice) {
  const { mailer } = kit.deps;
  const [store, origin] = await Promise.all([storeIdentity(tenant), kit.storeUrl(tenant)]);
  if (!mailer || !origin || !store.hostname) return false;
  const [owner] = await storeOwnerContacts({
    db: tenant.db,
    store: {
      organizationId: tenant.organizationId,
      name: store.name,
      slug: "",
      hostname: store.hostname,
    },
  });
  const locale = parseLocale(notice.locale) ?? defaultLocale;
  try {
    await mailer.send({
      to: notice.email,
      replyTo: owner?.email,
      ...orderUpdateMessage({
        locale,
        kind: notice.kind,
        storeName: store.name,
        orderNumber: notice.number,
        name: notice.name,
        total: formatPrice(notice.total, notice.currency, locale),
        shippingName: notice.shippingMethod?.name ?? null,
        pickup: notice.shippingMethod?.pickup ?? false,
        trackingNumber: notice.trackingNumber,
        payOnDelivery: notice.payOnDelivery,
        url: `${origin}/orders/${notice.token}`,
      }),
    });
    return true;
  } catch {
    return false;
  }
}

/** Orders in the workspace: the list, an order, confirming its payment, sending it or cancelling it. */
export const registerOrderTools: ToolModule = (server, kit) => {
  server.registerTool(
    "list_orders",
    {
      title: "List orders",
      description:
        "The store's orders, newest first, 25 per page. payment_submitted: the shopper sent their SINPE or transfer reference and the store has to check it. to_ship: paid (or paid on delivery) and still to send or hand over.",
      inputSchema: {
        store: storeArg,
        status: z.enum(orderStatuses).optional(),
        page: z.number().int().min(1).optional(),
      },
      annotations: readOnly,
    },
    kit.tool(
      async ({
        store,
        status,
        page,
      }: {
        store: string;
        status?: OrderListFilter;
        page?: number;
      }) => {
        const tenant = await kit.tenantFor(store);
        const list = await listOrders(tenant, { status, page });
        return json({
          ...list,
          orders: list.orders.map((order) => ({ ...order, total: money(order.total) })),
        });
      },
    ),
  );

  server.registerTool(
    "get_order",
    {
      title: "See an order",
      description:
        "An order with its buyer, address, lines, discount, payment reference, digital downloads and electronic invoices.",
      inputSchema: { store: storeArg, number: orderNumber },
      annotations: readOnly,
    },
    kit.tool(async ({ store, number }: { store: string; number: number }) => {
      const tenant = await kit.tenantFor(store);
      const order = await getOrder(tenant, number);
      if (!order) throw new ToolError(`No order #${number} in this store.`);
      const einvoices = await getOrderEinvoices(tenant, number);
      const amounts = Object.fromEntries(
        (["subtotal", "discount", "shipping", "total"] as const)
          .filter((key) => key in order)
          .map((key) => [key, money((order as Record<string, unknown>)[key] as number | null)]),
      );
      return json({
        order: {
          ...order,
          ...amounts,
          lines: order.lines.map((line) => ({
            ...line,
            unitPrice: money(line.unitPrice),
            lineTotal: money(line.lineTotal),
          })),
        },
        einvoices,
        workspace: kit.workspace(store, `/orders/${number}`),
      });
    }),
  );

  server.registerTool(
    "mark_order_paid",
    {
      title: "Confirm an order's payment",
      description:
        "After the person checked the SINPE Móvil or transfer arrived (or the cash came in): the order is paid, counts for the customer, gets its electronic invoice if the store issues them, the buyer is emailed (a digital order gets its download link) and an order to deliver moves to the to_ship list. Ask before confirming: it can't be undone.",
      inputSchema: { store: storeArg, number: orderNumber },
      annotations: { ...destructive, openWorldHint: true },
    },
    kit.tool(async ({ store, number }: { store: string; number: number }) => {
      const tenant = await kit.tenantFor(store);
      const { downloads, notice } = await markOrderPaid(tenant, number);
      const emailed = downloads ? await sendDownloadsEmail(kit, tenant, downloads) : null;
      const customerEmailed = notice ? await sendOrderUpdate(kit, tenant, notice) : null;
      return json({
        paid: true,
        downloadsEmailed: emailed,
        customerEmailed,
        ...(emailed === false
          ? { note: "The download link didn't go out; send it again with resend_downloads_link." }
          : {}),
      });
    }),
  );

  server.registerTool(
    "resend_downloads_link",
    {
      title: "Email the download link again",
      description:
        "For a paid digital order: a new link to the buyer's email (the old one stops working).",
      inputSchema: { store: storeArg, number: orderNumber },
      annotations: { ...destructive, openWorldHint: true },
    },
    kit.tool(async ({ store, number }: { store: string; number: number }) => {
      const tenant = await kit.tenantFor(store);
      // The workspace button's own counter (`downloadsEmail`): each one is an email to the buyer.
      const limit = await hitRateLimit(
        tenant.db,
        `downloadsEmail:${tenant.organizationId}:${number}`,
        { limit: 3, windowMs: 60 * 60 * 1000 },
      );
      if (!limit.allowed) throw new ToolError("Too many emails for this order; try again later.");
      const link = await renewDownloadsLink(tenant, number);
      if (!link) throw new ToolError(`Order #${number} isn't a paid order with downloads.`);
      return json({ emailed: await sendDownloadsEmail(kit, tenant, link), to: link.email });
    }),
  );

  server.registerTool(
    "cancel_order",
    {
      title: "Cancel an order",
      description:
        "Only an unpaid order: its stock goes back and a coupon it used is given back. Ask before cancelling: it can't be undone.",
      inputSchema: { store: storeArg, number: orderNumber },
      annotations: destructive,
    },
    kit.tool(async ({ store, number }: { store: string; number: number }) => {
      const tenant = await kit.tenantFor(store);
      const { notice } = await cancelOrder(tenant, number);
      return json({ cancelled: true, customerEmailed: await sendOrderUpdate(kit, tenant, notice) });
    }),
  );

  server.registerTool(
    "mark_order_shipped",
    {
      title: "Mark an order as sent",
      description:
        "When the store hands a paid order (or one paid on delivery) to the courier, or has it ready at the store when it's picked up: the buyer is emailed, with the tracking number if there is one. Use list_orders with status \"to_ship\" to see what's waiting. Ask before marking it.",
      inputSchema: {
        store: storeArg,
        number: orderNumber,
        trackingNumber: z
          .string()
          .optional()
          .describe("The courier's tracking number, if any; leave out for pickup"),
      },
      annotations: { ...destructive, idempotentHint: true, openWorldHint: true },
    },
    kit.tool(
      async ({
        store,
        number,
        trackingNumber,
      }: {
        store: string;
        number: number;
        trackingNumber?: string;
      }) => {
        const tenant = await kit.tenantFor(store);
        const input = orderShippedSchema.parse({ trackingNumber: trackingNumber ?? "" });
        const { notice } = await markOrderShipped(tenant, number, input);
        return json({
          shipped: true,
          customerEmailed: notice ? await sendOrderUpdate(kit, tenant, notice) : null,
        });
      },
    ),
  );

  server.registerTool(
    "mark_order_delivered",
    {
      title: "Mark an order as delivered",
      description:
        "When the buyer has the order. Paid on delivery (cash), it also confirms the payment: only once the money came in. Ask before marking it.",
      inputSchema: { store: storeArg, number: orderNumber },
      annotations: { ...destructive, idempotentHint: true },
    },
    kit.tool(async ({ store, number }: { store: string; number: number }) => {
      const tenant = await kit.tenantFor(store);
      await markOrderDelivered(tenant, number);
      return json({ delivered: true });
    }),
  );
};
