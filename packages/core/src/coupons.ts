import {
  type CouponInput,
  type CouponRules,
  couponCodePattern,
  normalizeCouponCode,
} from "@monaztore/contracts";
import { and, asc, type Database, desc, eq, inArray, ne, schema, sql } from "@monaztore/db";
import type { CouponKind } from "@monaztore/db/schema";
import { DomainError, NotFoundError } from "./errors";
import type { TenantContext } from "./tenant";

/**
 * The store's discount codes. Owners make them in the workspace (Coupons); shoppers type them
 * in the cart (`priceCart` with a code) and `placeOrder` counts the use under the coupon's lock,
 * so a code with one use left can't go to two orders.
 */

export interface CouponRow {
  id: string;
  code: string;
  note: string;
  kind: CouponKind;
  amount: number;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  usageLimitPerCustomer: number | null;
  minSubtotal: number | null;
  productIds: string[];
  categoryIds: string[];
  excludeSaleItems: boolean;
  active: boolean;
  usedCount: number;
  createdAt: Date;
}

const ownerOnly = (ctx: TenantContext) => {
  if (ctx.role !== "owner") throw new DomainError("forbidden", "Only owners manage coupons");
};

const columns = {
  id: schema.coupon.id,
  code: schema.coupon.code,
  note: schema.coupon.note,
  kind: schema.coupon.kind,
  amount: schema.coupon.amount,
  startsAt: schema.coupon.startsAt,
  endsAt: schema.coupon.endsAt,
  usageLimit: schema.coupon.usageLimit,
  usageLimitPerCustomer: schema.coupon.usageLimitPerCustomer,
  minSubtotal: schema.coupon.minSubtotal,
  productIds: schema.coupon.productIds,
  categoryIds: schema.coupon.categoryIds,
  excludeSaleItems: schema.coupon.excludeSaleItems,
  active: schema.coupon.active,
  usedCount: schema.coupon.usedCount,
  createdAt: schema.coupon.createdAt,
};

/** Every coupon of the store, newest first. */
export async function listCoupons(ctx: TenantContext): Promise<CouponRow[]> {
  return ctx.db
    .select(columns)
    .from(schema.coupon)
    .where(eq(schema.coupon.organizationId, ctx.organizationId))
    .orderBy(desc(schema.coupon.createdAt), asc(schema.coupon.code));
}

export async function getCoupon(
  ctx: TenantContext,
  couponId: string,
): Promise<CouponRow | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(couponId)) return undefined;
  const [found] = await ctx.db
    .select(columns)
    .from(schema.coupon)
    .where(
      and(eq(schema.coupon.organizationId, ctx.organizationId), eq(schema.coupon.id, couponId)),
    );
  return found;
}

/** Only the store's own products and collections can be in a coupon. */
async function ownScope(db: Database, organizationId: string, input: CouponInput) {
  const products = input.productIds.length
    ? await db
        .select({ id: schema.product.id })
        .from(schema.product)
        .where(
          and(
            eq(schema.product.organizationId, organizationId),
            inArray(schema.product.id, input.productIds),
          ),
        )
    : [];
  const categories = input.categoryIds.length
    ? await db
        .select({ id: schema.category.id })
        .from(schema.category)
        .where(
          and(
            eq(schema.category.organizationId, organizationId),
            inArray(schema.category.id, input.categoryIds),
          ),
        )
    : [];
  return {
    productIds: products.map((row) => row.id),
    categoryIds: categories.map((row) => row.id),
  };
}

/** Creates (`couponId` null) or saves a coupon. Two coupons of a store never share a code. */
export async function saveCoupon(
  ctx: TenantContext,
  couponId: string | null,
  input: CouponInput,
): Promise<string> {
  ownerOnly(ctx);
  const code = normalizeCouponCode(input.code);
  if (!couponCodePattern.test(code)) throw new DomainError("code_invalid", "Not a coupon code");
  if (input.kind === "percent" && (input.amount < 1 || input.amount > 100)) {
    throw new DomainError("amount_invalid", "A percentage goes from 1 to 100");
  }
  if (input.kind === "fixed" && input.amount <= 0) {
    throw new DomainError("amount_invalid", "An amount off has to be more than zero");
  }
  const [clash] = await ctx.db
    .select({ id: schema.coupon.id })
    .from(schema.coupon)
    .where(
      and(
        eq(schema.coupon.organizationId, ctx.organizationId),
        eq(schema.coupon.code, code),
        couponId ? ne(schema.coupon.id, couponId) : undefined,
      ),
    );
  if (clash) throw new DomainError("code_taken", `The store already has ${code}`);
  const scope = await ownScope(ctx.db, ctx.organizationId, input);
  const values = {
    code,
    note: input.note,
    kind: input.kind,
    amount: input.amount,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    usageLimit: input.usageLimit,
    usageLimitPerCustomer: input.usageLimitPerCustomer,
    minSubtotal: input.minSubtotal,
    ...scope,
    excludeSaleItems: input.excludeSaleItems,
    active: input.active,
  };
  if (couponId) {
    const updated = await ctx.db
      .update(schema.coupon)
      .set(values)
      .where(
        and(eq(schema.coupon.organizationId, ctx.organizationId), eq(schema.coupon.id, couponId)),
      )
      .returning({ id: schema.coupon.id });
    if (updated.length === 0) throw new NotFoundError("Coupon");
    return couponId;
  }
  const [created] = await ctx.db
    .insert(schema.coupon)
    .values({ organizationId: ctx.organizationId, ...values })
    .returning({ id: schema.coupon.id });
  if (!created) throw new Error("Coupon not created");
  return created.id;
}

/** Turns a coupon on or off without touching the rest. */
export async function setCouponActive(
  ctx: TenantContext,
  couponId: string,
  active: boolean,
): Promise<void> {
  ownerOnly(ctx);
  const updated = await ctx.db
    .update(schema.coupon)
    .set({ active })
    .where(
      and(eq(schema.coupon.organizationId, ctx.organizationId), eq(schema.coupon.id, couponId)),
    )
    .returning({ id: schema.coupon.id });
  if (updated.length === 0) throw new NotFoundError("Coupon");
}

/** Deletes a coupon. Orders that used it keep its code and what it took off. */
export async function deleteCoupon(ctx: TenantContext, couponId: string): Promise<void> {
  ownerOnly(ctx);
  const removed = await ctx.db
    .delete(schema.coupon)
    .where(
      and(eq(schema.coupon.organizationId, ctx.organizationId), eq(schema.coupon.id, couponId)),
    )
    .returning({ id: schema.coupon.id });
  if (removed.length === 0) throw new NotFoundError("Coupon");
}

export interface StoreCoupon extends CouponRules {
  id: string;
  usageLimitPerCustomer: number | null;
}

/** A store's coupon by the code a shopper typed (any case), for the cart and the checkout. */
export async function findCouponByCode(
  db: Database,
  organizationId: string,
  code: string,
  { lock = false }: { lock?: boolean } = {},
): Promise<StoreCoupon | undefined> {
  const normalized = normalizeCouponCode(code);
  if (!couponCodePattern.test(normalized)) return undefined;
  const query = db
    .select(columns)
    .from(schema.coupon)
    .where(
      and(eq(schema.coupon.organizationId, organizationId), eq(schema.coupon.code, normalized)),
    );
  const [found] = lock ? await query.for("update") : await query;
  return found;
}

/** Orders of this email that used the coupon and weren't cancelled. */
export async function couponUsesBy(db: Database, couponId: string, email: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.order)
    .where(
      and(
        eq(schema.order.couponId, couponId),
        eq(schema.order.email, email.trim().toLowerCase()),
        ne(schema.order.status, "cancelled"),
      ),
    );
  return row?.total ?? 0;
}
