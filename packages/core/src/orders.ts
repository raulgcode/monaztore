import { createHash, randomBytes } from "node:crypto";
import type { CartLine, CheckoutInput, CheckoutPaymentMethod } from "@monaztore/contracts";
import { and, asc, type Database, eq, inArray, schema, sql } from "@monaztore/db";
import type { EinvoiceKind, OrderStatus, OrderTaxId, StorePayments } from "@monaztore/db/schema";
import { storeIssuesInvoices } from "./einvoicing";
import { DomainError } from "./errors";
import type { StorefrontContext } from "./storefront";
import type { TenantContext } from "./tenant";

/** What the shopper needs to pay with each method the store accepts. */
export interface PaymentOptions {
  sinpe?: { phone: string; holder: string };
  transfer?: { bank: string; iban: string; holder: string };
}

async function storeSettingsOf(db: Database, organizationId: string) {
  const [settings] = await db
    .select({ currency: schema.storeSettings.currency, payments: schema.storeSettings.payments })
    .from(schema.storeSettings)
    .where(eq(schema.storeSettings.organizationId, organizationId));
  return { currency: settings?.currency ?? "CRC", payments: settings?.payments ?? {} };
}

function enabledPayments(payments: StorePayments): PaymentOptions {
  const options: PaymentOptions = {};
  if (payments.sinpe?.enabled) {
    options.sinpe = { phone: payments.sinpe.phone, holder: payments.sinpe.holder };
  }
  if (payments.transfer?.enabled) {
    const { bank, iban, holder } = payments.transfer;
    options.transfer = { bank, iban, holder };
  }
  return options;
}

/** The manual payments the store takes (only the ones turned on). */
export async function getPaymentOptions(ctx: StorefrontContext): Promise<PaymentOptions> {
  return enabledPayments((await storeSettingsOf(ctx.db, ctx.store.organizationId)).payments);
}

/** Sets how the store gets paid. Owners only: it decides where the money goes. */
export async function updateStorePayments(
  ctx: TenantContext,
  payments: StorePayments,
): Promise<void> {
  if (ctx.role !== "owner") throw new DomainError("forbidden", "Only owners manage payments");
  await ctx.db
    .insert(schema.storeSettings)
    .values({ organizationId: ctx.organizationId, payments })
    .onConflictDoUpdate({ target: schema.storeSettings.organizationId, set: { payments } });
}

export interface PricedLine {
  productId: string;
  variantId: string | null;
  slug: string;
  name: string;
  variantTitle: string | null;
  sku: string | null;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  /** How many are left when the store counts stock; null when it doesn't. */
  stockQuantity: number | null;
}

export interface PricedCart {
  lines: PricedLine[];
  subtotal: number;
  currency: string;
  /** Lines that can't be bought any more (gone, unpublished, sold out, no price). */
  removed: number;
  /** Lines asking for more than there is. */
  shortOfStock: number;
}

const titleOf = (options: Record<string, string>) => Object.values(options).join(" / ") || null;

/**
 * The cart as the store sells it today: prices and stock from the database, never from the
 * cookie. What can't be bought is left out and counted, so the page can say so.
 */
export async function priceCart(
  ctx: StorefrontContext,
  cart: readonly CartLine[],
  { lock = false }: { lock?: boolean } = {},
): Promise<PricedCart> {
  const { currency } = await storeSettingsOf(ctx.db, ctx.store.organizationId);
  const productIds = [...new Set(cart.map((line) => line.productId))];
  if (productIds.length === 0) {
    return { lines: [], subtotal: 0, currency, removed: 0, shortOfStock: 0 };
  }
  const productQuery = ctx.db
    .select({
      id: schema.product.id,
      slug: schema.product.slug,
      name: schema.product.name,
      sku: schema.product.sku,
      price: schema.product.price,
      stockQuantity: schema.product.stockQuantity,
      inStock: schema.product.inStock,
    })
    .from(schema.product)
    .where(
      and(
        eq(schema.product.organizationId, ctx.store.organizationId),
        eq(schema.product.status, "active"),
        inArray(schema.product.id, productIds),
      ),
    );
  const products = lock ? await productQuery.for("update") : await productQuery;
  const found = new Map(products.map((p) => [p.id, p]));
  const ids = [...found.keys()];
  const variantQuery = ctx.db
    .select()
    .from(schema.productVariant)
    .where(inArray(schema.productVariant.productId, ids));
  const variants =
    ids.length === 0 ? [] : lock ? await variantQuery.for("update") : await variantQuery;
  const images = ids.length
    ? await ctx.db
        .select({ productId: schema.productImage.productId, url: schema.productImage.url })
        .from(schema.productImage)
        .where(inArray(schema.productImage.productId, ids))
        .orderBy(asc(schema.productImage.position))
    : [];
  const firstImage = new Map<string, string>();
  for (const image of images)
    if (!firstImage.has(image.productId)) firstImage.set(image.productId, image.url);

  const lines: PricedLine[] = [];
  let removed = 0;
  let shortOfStock = 0;
  for (const line of cart) {
    const product = found.get(line.productId);
    const own = variants.filter((v) => v.productId === line.productId);
    // A product with variants is bought by variant; one without, by itself.
    const variant = line.variantId ? own.find((v) => v.id === line.variantId) : undefined;
    if (!product || (own.length > 0 ? !variant : line.variantId !== null)) {
      removed++;
      continue;
    }
    const unitPrice = variant ? (variant.price ?? product.price) : product.price;
    const stockQuantity = variant ? variant.stockQuantity : product.stockQuantity;
    const inStock = variant ? variant.inStock : product.inStock;
    if (unitPrice === null || !inStock || stockQuantity === 0) {
      removed++;
      continue;
    }
    let quantity = line.quantity;
    if (stockQuantity !== null && quantity > stockQuantity) {
      quantity = stockQuantity;
      shortOfStock++;
    }
    lines.push({
      productId: product.id,
      variantId: variant?.id ?? null,
      slug: product.slug,
      name: product.name,
      variantTitle: variant ? titleOf(variant.options) : null,
      sku: variant?.sku ?? product.sku,
      imageUrl: (variant?.imageUrl ?? firstImage.get(product.id)) || null,
      unitPrice,
      quantity,
      lineTotal: unitPrice * quantity,
      stockQuantity,
    });
  }
  return {
    lines,
    subtotal: lines.reduce((sum, line) => sum + line.lineTotal, 0),
    currency,
    removed,
    shortOfStock,
  };
}

/** The order link's secret: only its SHA-256 is stored. */
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export interface PlacedOrder {
  number: number;
  /** Goes in the shopper's link (`/orders/:token`); never stored as is. */
  token: string;
}

/**
 * Turns the cart into an order waiting for payment. Prices and stock are read again under lock,
 * so two shoppers can't buy the last one; stock the store counts goes down now and comes back if
 * the order is cancelled.
 */
export async function placeOrder(
  ctx: StorefrontContext,
  {
    cart,
    checkout,
    locale,
    taxId = null,
  }: {
    cart: readonly CartLine[];
    checkout: CheckoutInput;
    locale: string;
    /** "Invoice in my name" (Costa Rica): kept only if the store issues invoices. */
    taxId?: OrderTaxId | null;
  },
): Promise<PlacedOrder> {
  const organizationId = ctx.store.organizationId;
  return ctx.db.transaction(async (tx) => {
    const store = { ...ctx, db: tx as unknown as Database };
    const { payments } = await storeSettingsOf(store.db, organizationId);
    if (!enabledPayments(payments)[checkout.paymentMethod as CheckoutPaymentMethod]) {
      throw new DomainError("payment_method_unavailable", "The store doesn't take this payment");
    }
    const priced = await priceCart(store, cart, { lock: true });
    if (priced.lines.length === 0) throw new DomainError("cart_empty", "Nothing to buy");
    if (priced.removed > 0 || priced.shortOfStock > 0) {
      throw new DomainError("cart_changed", "Prices or stock changed: review the cart");
    }

    // The settings row holds the counter; the upsert locks it until the transaction ends.
    const [counter] = await tx
      .insert(schema.storeSettings)
      .values({ organizationId, nextOrderNumber: 1002 })
      .onConflictDoUpdate({
        target: schema.storeSettings.organizationId,
        set: { nextOrderNumber: sql`${schema.storeSettings.nextOrderNumber} + 1` },
      })
      .returning({ next: schema.storeSettings.nextOrderNumber });
    const number = (counter?.next ?? 1002) - 1;

    const [customer] = await tx
      .insert(schema.customer)
      .values({
        organizationId,
        email: checkout.email,
        firstName: checkout.name,
        phone: checkout.phone,
      })
      .onConflictDoUpdate({
        target: [schema.customer.organizationId, schema.customer.email],
        set: { phone: checkout.phone },
      })
      .returning({ id: schema.customer.id });

    const token = randomBytes(24).toString("base64url");
    const [created] = await tx
      .insert(schema.order)
      .values({
        organizationId,
        number,
        tokenHash: hashToken(token),
        paymentMethod: checkout.paymentMethod,
        customerId: customer?.id,
        email: checkout.email,
        name: checkout.name,
        phone: checkout.phone,
        shippingAddress: {
          line1: checkout.line1,
          city: checkout.city,
          province: checkout.province,
          notes: checkout.notes,
        },
        currency: priced.currency,
        subtotal: priced.subtotal,
        total: priced.subtotal,
        locale,
        taxId: taxId && (await storeIssuesInvoices(tx, organizationId)) ? taxId : null,
      })
      .returning({ id: schema.order.id });
    if (!created) throw new Error("Order not created");

    await tx.insert(schema.orderLine).values(
      priced.lines.map((line, position) => ({
        orderId: created.id,
        productId: line.productId,
        variantId: line.variantId,
        name: line.name,
        variantTitle: line.variantTitle,
        sku: line.sku,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        lineTotal: line.lineTotal,
        position,
      })),
    );

    for (const line of priced.lines) {
      if (line.stockQuantity === null) continue;
      const left = line.stockQuantity - line.quantity;
      if (line.variantId) {
        await tx
          .update(schema.productVariant)
          .set({ stockQuantity: left, inStock: left > 0 })
          .where(eq(schema.productVariant.id, line.variantId));
      } else {
        await tx
          .update(schema.product)
          .set({ stockQuantity: left, inStock: left > 0 })
          .where(eq(schema.product.id, line.productId));
      }
    }
    return { number, token };
  });
}

export interface ShopperOrder {
  number: number;
  status: OrderStatus;
  paymentMethod: CheckoutPaymentMethod;
  paymentReference: string | null;
  name: string;
  email: string;
  currency: string;
  subtotal: number;
  total: number;
  createdAt: Date;
  shippingAddress: { line1: string; city: string; province: string; notes: string };
  lines: {
    name: string;
    variantTitle: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  /** Where to send the money, for the method they chose. */
  payTo: PaymentOptions;
  /** Hacienda's document, once it accepted it (Costa Rica). */
  einvoice: ShopperEinvoice | null;
}

export interface ShopperEinvoice {
  kind: EinvoiceKind;
  consecutive: string;
  clave: string;
}

/** The order's live document (not a rejected one), with its files. */
async function orderEinvoice(ctx: StorefrontContext, orderId: string) {
  const [found] = await ctx.db
    .select({
      kind: schema.einvoice.kind,
      consecutive: schema.einvoice.consecutive,
      clave: schema.einvoice.clave,
      status: schema.einvoice.status,
      signedXml: schema.einvoice.signedXml,
      responseXml: schema.einvoice.responseXml,
    })
    .from(schema.einvoice)
    .where(
      and(
        eq(schema.einvoice.organizationId, ctx.store.organizationId),
        eq(schema.einvoice.orderId, orderId),
        eq(schema.einvoice.status, "accepted"),
      ),
    );
  return found;
}

/** The accepted document's signed XML or Hacienda's answer, for the order's link only. */
export async function getShopperEinvoiceFile(
  ctx: StorefrontContext,
  token: string,
  file: "document" | "response",
) {
  const found = await orderByToken(ctx, token);
  if (!found) return undefined;
  const einvoice = await orderEinvoice(ctx, found.id);
  const xml = file === "document" ? einvoice?.signedXml : einvoice?.responseXml;
  return einvoice && xml ? { clave: einvoice.clave, xml } : undefined;
}

async function orderByToken(ctx: StorefrontContext, token: string) {
  const [found] = await ctx.db
    .select()
    .from(schema.order)
    .where(
      and(
        eq(schema.order.organizationId, ctx.store.organizationId),
        eq(schema.order.tokenHash, hashToken(token)),
      ),
    );
  return found;
}

/** The order the link opens, in this store only. */
export async function getOrderByToken(
  ctx: StorefrontContext,
  token: string,
): Promise<ShopperOrder | undefined> {
  const found = await orderByToken(ctx, token);
  if (!found) return undefined;
  const lines = await ctx.db
    .select({
      name: schema.orderLine.name,
      variantTitle: schema.orderLine.variantTitle,
      quantity: schema.orderLine.quantity,
      unitPrice: schema.orderLine.unitPrice,
      lineTotal: schema.orderLine.lineTotal,
    })
    .from(schema.orderLine)
    .where(eq(schema.orderLine.orderId, found.id))
    .orderBy(asc(schema.orderLine.position));
  const [options, einvoice] = await Promise.all([
    getPaymentOptions(ctx),
    orderEinvoice(ctx, found.id),
  ]);
  const method = found.paymentMethod as CheckoutPaymentMethod;
  return {
    number: found.number,
    status: found.status,
    paymentMethod: method,
    paymentReference: found.paymentReference,
    name: found.name,
    email: found.email,
    currency: found.currency,
    subtotal: found.subtotal,
    total: found.total,
    createdAt: found.createdAt,
    shippingAddress: found.shippingAddress,
    lines,
    payTo: options[method] ? { [method]: options[method] } : {},
    einvoice: einvoice
      ? { kind: einvoice.kind, consecutive: einvoice.consecutive, clave: einvoice.clave }
      : null,
  };
}

/**
 * The shopper says they paid and with which reference. They can correct it until the store
 * confirms or cancels the order.
 */
export async function submitPaymentReference(
  ctx: StorefrontContext,
  token: string,
  reference: string,
): Promise<void> {
  const found = await orderByToken(ctx, token);
  if (!found) throw new DomainError("not_found", "No such order");
  const [updated] = await ctx.db
    .update(schema.order)
    .set({
      paymentReference: reference,
      paymentSubmittedAt: new Date(),
      status: "payment_submitted",
    })
    .where(
      and(
        eq(schema.order.id, found.id),
        inArray(schema.order.status, ["pending_payment", "payment_submitted"]),
      ),
    )
    .returning({ id: schema.order.id });
  if (!updated) throw new DomainError("order_closed", "The order is already paid or cancelled");
}
