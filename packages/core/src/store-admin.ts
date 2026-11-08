import { and, asc, count, desc, eq, inArray, schema, sql } from "@monaztore/db";
import type { OrderStatus, StorePayments } from "@monaztore/db/schema";
import { queueOrderEinvoice } from "./einvoicing";
import { DomainError } from "./errors";
import type { TenantContext } from "./tenant";

/** What the workspace does with a store's orders, domains and payments. */

export const ADMIN_ORDERS_PAGE_SIZE = 25;

export interface OrderRow {
  number: number;
  status: OrderStatus;
  name: string;
  total: number;
  currency: string;
  paymentMethod: string;
  createdAt: Date;
}

/** The store's orders, newest first; `status` narrows to one state. */
export async function listOrders(
  ctx: TenantContext,
  { status, page = 1 }: { status?: OrderStatus; page?: number } = {},
): Promise<{ orders: OrderRow[]; total: number; page: number; pages: number }> {
  const where = and(
    eq(schema.order.organizationId, ctx.organizationId),
    status ? eq(schema.order.status, status) : undefined,
  );
  const [totals] = await ctx.db.select({ total: count() }).from(schema.order).where(where);
  const total = totals?.total ?? 0;
  const pages = Math.ceil(total / ADMIN_ORDERS_PAGE_SIZE);
  const current = Math.min(Math.max(1, Math.floor(page)), Math.max(1, pages));
  const orders = await ctx.db
    .select({
      number: schema.order.number,
      status: schema.order.status,
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

/** How many orders wait for the store: a payment to check, or one still unpaid. */
export async function countOrdersToReview(ctx: TenantContext): Promise<number> {
  const [row] = await ctx.db
    .select({ total: count() })
    .from(schema.order)
    .where(
      and(
        eq(schema.order.organizationId, ctx.organizationId),
        eq(schema.order.status, "payment_submitted"),
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
  const { tokenHash: _secret, ...order } = found;
  return { ...order, lines };
}

/**
 * The store saw the money: the order is paid, and the customer's orders and spend go up. Works
 * from "waiting" too, for a payment the shopper never reported.
 */
export async function markOrderPaid(ctx: TenantContext, number: number): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    const [updated] = await tx
      .update(schema.order)
      .set({ status: "paid", paidAt: new Date() })
      .where(
        and(
          eq(schema.order.organizationId, ctx.organizationId),
          eq(schema.order.number, number),
          inArray(schema.order.status, ["pending_payment", "payment_submitted"]),
        ),
      )
      .returning({
        id: schema.order.id,
        customerId: schema.order.customerId,
        total: schema.order.total,
      });
    if (!updated) throw new DomainError("order_closed", "Only an open order can be paid");
    // Costa Rica: the order's invoice or ticket goes to Hacienda's queue, if the store issues
    // them on payment. Paid without it all the same if something stops it.
    await queueOrderEinvoice(tx, {
      organizationId: ctx.organizationId,
      orderId: updated.id,
      onlyAuto: true,
    }).catch((error: unknown) => {
      if (!(error instanceof DomainError)) throw error;
    });
    if (updated.customerId) {
      await tx
        .update(schema.customer)
        .set({
          ordersCount: sql`${schema.customer.ordersCount} + 1`,
          totalSpent: sql`${schema.customer.totalSpent} + ${updated.total}`,
        })
        .where(eq(schema.customer.id, updated.customerId));
    }
  });
}

/** Cancels an unpaid order and puts its counted stock back. */
export async function cancelOrder(ctx: TenantContext, number: number): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    const [updated] = await tx
      .update(schema.order)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(schema.order.organizationId, ctx.organizationId),
          eq(schema.order.number, number),
          inArray(schema.order.status, ["pending_payment", "payment_submitted"]),
        ),
      )
      .returning({ id: schema.order.id });
    if (!updated) throw new DomainError("order_closed", "Only an open order can be cancelled");
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
