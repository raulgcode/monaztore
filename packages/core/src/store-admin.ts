import { createHash, randomBytes } from "node:crypto";
import { and, asc, count, type Database, desc, eq, inArray, or, schema, sql } from "@monaztore/db";
import type { OrderFulfillment, OrderStatus, StorePayments } from "@monaztore/db/schema";
import { queueOrderEinvoice } from "./einvoicing";
import { DomainError } from "./errors";
import type { TenantContext } from "./tenant";

/** What the workspace does with a store's orders, domains and payments. */

export const ADMIN_ORDERS_PAGE_SIZE = 25;

export interface OrderRow {
  number: number;
  status: OrderStatus;
  fulfillment: OrderFulfillment;
  needsShipping: boolean;
  name: string;
  total: number;
  currency: string;
  paymentMethod: string;
  createdAt: Date;
}

/**
 * Orders the store has to send: paid (or paid on delivery and not cancelled), with something to
 * ship, and not sent yet.
 */
const toShip = and(
  eq(schema.order.needsShipping, true),
  eq(schema.order.fulfillment, "unfulfilled"),
  or(
    eq(schema.order.status, "paid"),
    and(eq(schema.order.paymentMethod, "cash"), eq(schema.order.status, "pending_payment")),
  ),
);

/** A filter of the order list: a payment state, or the ones still to send (`to_ship`). */
export type OrderListFilter = OrderStatus | "to_ship";

/** The store's orders, newest first; `status` narrows to one state, or to what's left to send. */
export async function listOrders(
  ctx: TenantContext,
  { status, page = 1 }: { status?: OrderListFilter; page?: number } = {},
): Promise<{ orders: OrderRow[]; total: number; page: number; pages: number }> {
  const where = and(
    eq(schema.order.organizationId, ctx.organizationId),
    status === "to_ship" ? toShip : status ? eq(schema.order.status, status) : undefined,
  );
  const [totals] = await ctx.db.select({ total: count() }).from(schema.order).where(where);
  const total = totals?.total ?? 0;
  const pages = Math.ceil(total / ADMIN_ORDERS_PAGE_SIZE);
  const current = Math.min(Math.max(1, Math.floor(page)), Math.max(1, pages));
  const orders = await ctx.db
    .select({
      number: schema.order.number,
      status: schema.order.status,
      fulfillment: schema.order.fulfillment,
      needsShipping: schema.order.needsShipping,
      name: schema.order.name,
      total: schema.order.total,
      currency: schema.order.currency,
      paymentMethod: schema.order.paymentMethod,
      createdAt: schema.order.createdAt,
    })
    .from(schema.order)
    .where(where)
    .orderBy(desc(schema.order.number))
    .limit(ADMIN_ORDERS_PAGE_SIZE)
    .offset((current - 1) * ADMIN_ORDERS_PAGE_SIZE);
  return { orders, total, page: current, pages };
}

/** How many orders wait for the store: a payment to check, or one to send. */
export async function countOrdersToReview(ctx: TenantContext): Promise<number> {
  const [row] = await ctx.db
    .select({ total: count() })
    .from(schema.order)
    .where(
      and(
        eq(schema.order.organizationId, ctx.organizationId),
        or(eq(schema.order.status, "payment_submitted"), toShip),
      ),
    );
  return row?.total ?? 0;
}

async function findOrder(ctx: TenantContext, number: number) {
  const [found] = await ctx.db
    .select()
    .from(schema.order)
    .where(
      and(eq(schema.order.organizationId, ctx.organizationId), eq(schema.order.number, number)),
    );
  return found;
}

/** One order with its lines, for the store. */
export async function getOrder(ctx: TenantContext, number: number) {
  const found = await findOrder(ctx, number);
  if (!found) return undefined;
  const lines = await ctx.db
    .select({
      name: schema.orderLine.name,
      variantTitle: schema.orderLine.variantTitle,
      sku: schema.orderLine.sku,
      quantity: schema.orderLine.quantity,
      unitPrice: schema.orderLine.unitPrice,
      lineTotal: schema.orderLine.lineTotal,
    })
    .from(schema.orderLine)
    .where(eq(schema.orderLine.orderId, found.id))
    .orderBy(asc(schema.orderLine.position));
  const downloads = await ctx.db
    .select({
      fileName: schema.orderDownload.fileName,
      downloads: schema.orderDownload.downloads,
      downloadLimit: schema.orderDownload.downloadLimit,
      expiresAt: schema.orderDownload.expiresAt,
    })
    .from(schema.orderDownload)
    .where(
      and(
        eq(schema.orderDownload.organizationId, ctx.organizationId),
        eq(schema.orderDownload.orderId, found.id),
      ),
    )
    .orderBy(asc(schema.orderDownload.position));
  const {
    tokenHash: _secret,
    followTokenHashes: _follow,
    downloadTokenHash: _link,
    ...order
  } = found;
  return { ...order, lines, downloads };
}

/**
 * Where the downloads email goes, with the link's secret (`/downloads/:token`): only its SHA-256
 * is kept, so this is the one moment it exists.
 */
export interface DownloadsLink {
  token: string;
  number: number;
  email: string;
  name: string;
  locale: string;
  files: string[];
}

/** A new secret for the order's downloads email; the one before stops working. */
async function newDownloadsLink(
  db: Database,
  order: { id: string; number: number; email: string; name: string; locale: string },
): Promise<DownloadsLink | null> {
  const files = await db
    .select({ fileName: schema.orderDownload.fileName })
    .from(schema.orderDownload)
    .where(eq(schema.orderDownload.orderId, order.id))
    .orderBy(asc(schema.orderDownload.position));
  if (files.length === 0) return null;
  const token = randomBytes(24).toString("base64url");
  await db
    .update(schema.order)
    .set({ downloadTokenHash: createHash("sha256").update(token).digest("hex") })
    .where(eq(schema.order.id, order.id));
  return {
    token,
    number: order.number,
    email: order.email,
    name: order.name,
    locale: order.locale,
    files: files.map((file) => file.fileName),
  };
}

/**
 * The downloads email's link again (the shopper lost it, or it didn't arrive): a new one, for a
 * paid order with files. Undefined otherwise.
 */
export async function renewDownloadsLink(
  ctx: TenantContext,
  number: number,
): Promise<DownloadsLink | undefined> {
  const found = await findOrder(ctx, number);
  if (found?.status !== "paid") return undefined;
  return (await newDownloadsLink(ctx.db, found)) ?? undefined;
}

/**
 * What the shopper is told when their order moves (payment confirmed, sent or ready to pick up,
 * cancelled), with a new link to its page: only its SHA-256 is kept, so this is the one moment it
 * exists. The links of earlier emails keep working (the last few).
 */
export interface OrderNotice {
  kind: "paid" | "shipped" | "cancelled";
  token: string;
  number: number;
  email: string;
  name: string;
  locale: string;
  total: number;
  currency: string;
  /** The shipping option chosen; `pickup` = they collect it at the store. */
  shippingMethod: { name: string; pickup: boolean } | null;
  trackingNumber: string | null;
  /** Paid on delivery and not paid yet: the shopper has the money ready when it arrives. */
  payOnDelivery: boolean;
}

/** How many links of follow-up emails an order keeps (older ones stop working). */
const FOLLOW_LINKS_MAX = 5;

type OrderRowFull = typeof schema.order.$inferSelect;

async function orderNotice(
  db: Database,
  order: OrderRowFull,
  kind: OrderNotice["kind"],
): Promise<OrderNotice> {
  const token = randomBytes(24).toString("base64url");
  const hashes = [...order.followTokenHashes, createHash("sha256").update(token).digest("hex")];
  await db
    .update(schema.order)
    .set({ followTokenHashes: hashes.slice(-FOLLOW_LINKS_MAX) })
    .where(eq(schema.order.id, order.id));
  return {
    kind,
    token,
    number: order.number,
    email: order.email,
    name: order.name,
    locale: order.locale,
    total: order.total,
    currency: order.currency,
    shippingMethod: order.shippingMethod
      ? { name: order.shippingMethod.name, pickup: order.shippingMethod.pickup }
      : null,
    trackingNumber: order.trackingNumber,
    payOnDelivery: order.paymentMethod === "cash" && order.status !== "paid",
  };
}

/** The order of this store, locked until the transaction ends. */
async function lockOrder(tx: Database, ctx: TenantContext, number: number) {
  const [found] = await tx
    .select()
    .from(schema.order)
    .where(
      and(eq(schema.order.organizationId, ctx.organizationId), eq(schema.order.number, number)),
    )
    .for("update");
  return found;
}

/** Marks a locked open order paid: downloads open, its invoice queues, the customer's spend grows. */
async function payOrder(
  tx: Database,
  ctx: TenantContext,
  found: OrderRowFull,
  now: Date,
): Promise<DownloadsLink | null> {
  await tx
    .update(schema.order)
    .set({ status: "paid", paidAt: now })
    .where(eq(schema.order.id, found.id));
  // Digital products open now, for as many days as each one gives from today.
  await tx
    .update(schema.orderDownload)
    .set({
      expiresAt: sql`case when ${schema.orderDownload.downloadDays} is null then null else ${now}::timestamptz + make_interval(days => ${schema.orderDownload.downloadDays}) end`,
    })
    .where(eq(schema.orderDownload.orderId, found.id));
  const downloads = await newDownloadsLink(tx, found);
  // Costa Rica: the order's invoice or ticket goes to Hacienda's queue, if the store issues
  // them on payment. Paid without it all the same if something stops it.
  await queueOrderEinvoice(tx, {
    organizationId: ctx.organizationId,
    orderId: found.id,
    onlyAuto: true,
  }).catch((error: unknown) => {
    if (!(error instanceof DomainError)) throw error;
  });
  if (found.customerId) {
    await tx
      .update(schema.customer)
      .set({
        ordersCount: sql`${schema.customer.ordersCount} + 1`,
        totalSpent: sql`${schema.customer.totalSpent} + ${found.total}`,
      })
      .where(eq(schema.customer.id, found.customerId));
  }
  return downloads;
}

const isOpen = (status: OrderStatus) =>
  status === "pending_payment" || status === "payment_submitted";

/**
 * The store saw the money: the order is paid, and the customer's orders and spend go up. Works
 * from "waiting" too, for a payment the shopper never reported. `notice` tells the shopper of an
 * order that ships (a download gets its downloads email instead), unless it was already delivered.
 */
export async function markOrderPaid(
  ctx: TenantContext,
  number: number,
  now = new Date(),
): Promise<{ downloads: DownloadsLink | null; notice: OrderNotice | null }> {
  return ctx.db.transaction(async (transaction) => {
    const tx = transaction as unknown as Database;
    const found = await lockOrder(tx, ctx, number);
    if (!found || !isOpen(found.status)) {
      throw new DomainError("order_closed", "Only an open order can be paid");
    }
    const downloads = await payOrder(tx, ctx, found, now);
    const notice =
      found.needsShipping && found.fulfillment !== "delivered"
        ? await orderNotice(tx, { ...found, status: "paid" }, "paid")
        : null;
    return { downloads, notice };
  });
}

/**
 * The store sent the order (or it's ready to pick up at the store), with the courier's tracking
 * number if there is one. Only a paid order, or one paid on delivery; typing it again on a sent
 * order changes the tracking number without telling the shopper twice.
 */
export async function markOrderShipped(
  ctx: TenantContext,
  number: number,
  { trackingNumber }: { trackingNumber?: string | null } = {},
  now = new Date(),
): Promise<{ notice: OrderNotice | null }> {
  const tracking = trackingNumber?.trim().slice(0, 120) || null;
  return ctx.db.transaction(async (transaction) => {
    const tx = transaction as unknown as Database;
    const found = await lockOrder(tx, ctx, number);
    if (!found) throw new DomainError("not_found", "There is no order with that number");
    if (!found.needsShipping)
      throw new DomainError(
        "nothing_to_ship",
        "This order only has downloads: there is nothing to send",
      );
    if (found.status === "cancelled")
      throw new DomainError("order_closed", "This order was cancelled");
    if (found.status !== "paid" && found.paymentMethod !== "cash") {
      throw new DomainError("not_paid", "Confirm the payment before sending it");
    }
    if (found.fulfillment === "delivered")
      throw new DomainError("delivered", "This order was already delivered");
    const first = found.fulfillment === "unfulfilled";
    await tx
      .update(schema.order)
      .set({
        fulfillment: "shipped",
        trackingNumber: tracking,
        shippedAt: first ? now : found.shippedAt,
      })
      .where(eq(schema.order.id, found.id));
    return {
      notice: first
        ? await orderNotice(tx, { ...found, trackingNumber: tracking }, "shipped")
        : null,
    };
  });
}

/**
 * The shopper has it. Paid on delivery, this is also when the money came in: the order is paid
 * with it (its invoice and the customer's spend), without a "payment confirmed" email.
 */
export async function markOrderDelivered(
  ctx: TenantContext,
  number: number,
  now = new Date(),
): Promise<void> {
  await ctx.db.transaction(async (transaction) => {
    const tx = transaction as unknown as Database;
    const found = await lockOrder(tx, ctx, number);
    if (!found) throw new DomainError("not_found", "There is no order with that number");
    if (!found.needsShipping)
      throw new DomainError(
        "nothing_to_ship",
        "This order only has downloads: there is nothing to send",
      );
    if (found.status === "cancelled")
      throw new DomainError("order_closed", "This order was cancelled");
    if (found.status !== "paid" && found.paymentMethod !== "cash") {
      throw new DomainError("not_paid", "Confirm the payment before delivering it");
    }
    if (found.fulfillment === "delivered") return;
    if (isOpen(found.status)) await payOrder(tx, ctx, found, now);
    await tx
      .update(schema.order)
      .set({ fulfillment: "delivered", deliveredAt: now, shippedAt: found.shippedAt ?? now })
      .where(eq(schema.order.id, found.id));
  });
}

/** Cancels an unpaid order and puts its counted stock back; `notice` tells the shopper. */
export async function cancelOrder(
  ctx: TenantContext,
  number: number,
): Promise<{ notice: OrderNotice }> {
  return ctx.db.transaction(async (tx) => {
    const [updated] = await tx
      .update(schema.order)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(schema.order.organizationId, ctx.organizationId),
          eq(schema.order.number, number),
          inArray(schema.order.status, ["pending_payment", "payment_submitted"]),
          // Delivered, it can't come back to the shelf.
          sql`${schema.order.fulfillment} <> 'delivered'`,
        ),
      )
      .returning();
    if (!updated) throw new DomainError("order_closed", "Only an open order can be cancelled");
    // The coupon's use comes back too.
    if (updated.couponId) {
      await tx
        .update(schema.coupon)
        .set({ usedCount: sql`greatest(${schema.coupon.usedCount} - 1, 0)` })
        .where(eq(schema.coupon.id, updated.couponId));
    }
    const lines = await tx
      .select({
        productId: schema.orderLine.productId,
        variantId: schema.orderLine.variantId,
        quantity: schema.orderLine.quantity,
      })
      .from(schema.orderLine)
      .where(eq(schema.orderLine.orderId, updated.id));
    for (const line of lines) {
      // Only stock the store counts (not null) comes back.
      const back = (table: typeof schema.product | typeof schema.productVariant) => ({
        stockQuantity: sql`${table.stockQuantity} + ${line.quantity}`,
        inStock: true,
      });
      if (line.variantId) {
        await tx
          .update(schema.productVariant)
          .set(back(schema.productVariant))
          .where(
            and(
              eq(schema.productVariant.id, line.variantId),
              sql`${schema.productVariant.stockQuantity} is not null`,
            ),
          );
      } else if (line.productId) {
        await tx
          .update(schema.product)
          .set(back(schema.product))
          .where(
            and(
              eq(schema.product.id, line.productId),
              eq(schema.product.organizationId, ctx.organizationId),
              sql`${schema.product.stockQuantity} is not null`,
            ),
          );
      }
    }
    return { notice: await orderNotice(tx as unknown as Database, updated, "cancelled") };
  });
}

/** The store's domains, the primary first. */
export function listStoreDomains(ctx: TenantContext) {
  return ctx.db
    .select({ hostname: schema.storeDomain.hostname, primary: schema.storeDomain.primary })
    .from(schema.storeDomain)
    .where(eq(schema.storeDomain.organizationId, ctx.organizationId))
    .orderBy(desc(schema.storeDomain.primary), asc(schema.storeDomain.hostname));
}

/** Makes one domain the one links point to. Owners only. */
export async function setPrimaryDomain(ctx: TenantContext, hostname: string): Promise<void> {
  if (ctx.role !== "owner") throw new DomainError("forbidden", "Only owners manage domains");
  await ctx.db.transaction(async (tx) => {
    const [found] = await tx
      .update(schema.storeDomain)
      .set({ primary: true })
      .where(
        and(
          eq(schema.storeDomain.organizationId, ctx.organizationId),
          eq(schema.storeDomain.hostname, hostname),
        ),
      )
      .returning({ id: schema.storeDomain.id });
    if (!found) throw new DomainError("not_found", "No such domain");
    await tx
      .update(schema.storeDomain)
      .set({ primary: false })
      .where(
        and(
          eq(schema.storeDomain.organizationId, ctx.organizationId),
          sql`${schema.storeDomain.id} <> ${found.id}`,
        ),
      );
  });
}

/** Disconnects a domain. Owners only. */
export async function removeStoreDomain(ctx: TenantContext, hostname: string): Promise<void> {
  if (ctx.role !== "owner") throw new DomainError("forbidden", "Only owners manage domains");
  await ctx.db
    .delete(schema.storeDomain)
    .where(
      and(
        eq(schema.storeDomain.organizationId, ctx.organizationId),
        eq(schema.storeDomain.hostname, hostname),
      ),
    );
}

/** The payment settings as the store set them, switched off ones included. */
export async function getStorePayments(ctx: TenantContext): Promise<StorePayments> {
  const [row] = await ctx.db
    .select({ payments: schema.storeSettings.payments })
    .from(schema.storeSettings)
    .where(eq(schema.storeSettings.organizationId, ctx.organizationId));
  return row?.payments ?? {};
}
