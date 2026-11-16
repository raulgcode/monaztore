import {
  getOrderByToken,
  type OrderNotice,
  type ShopperOrder,
  type StorefrontContext,
  storeIdentity,
  storeOwnerContacts,
  type TenantContext,
} from "@monaztore/core";
import {
  emailT,
  type OrderEmailLine,
  orderPlacedMessage,
  orderUpdateMessage,
  storeOrderMessage,
} from "@monaztore/email";
import { defaultLocale, type Locale, parseLocale } from "@monaztore/i18n";
import { href } from "react-router";
import { formatPrice } from "./money";
import { env, mailer } from "./services.server";
import { storeOrigin } from "./store-seo";

/** What they bought, then the discount and the shipping, so the lines add up to the total. */
function orderLines(order: ShopperOrder, locale: Locale): OrderEmailLine[] {
  const t = emailT(locale);
  const lines = order.lines.map((line) => ({
    label: `${line.name}${line.variantTitle ? ` (${line.variantTitle})` : ""} × ${line.quantity}`,
    total: formatPrice(line.lineTotal, order.currency, locale),
  }));
  if (order.discount > 0) {
    lines.push({
      label: t("email.orderDiscount", { code: order.couponCode ?? "" }),
      total: `−${formatPrice(order.discount, order.currency, locale)}`,
    });
  }
  if (order.shippingMethod) {
    lines.push({
      label: t("email.orderShipping", { name: order.shippingMethod.name }),
      total:
        order.shippingFee === 0
          ? t("email.orderShippingFree")
          : formatPrice(order.shippingFee, order.currency, locale),
    });
  }
  return lines;
}

/** How it reaches them: the option chosen, then where (nothing more for a pickup). */
function deliveryLines(order: ShopperOrder): string[] {
  if (!order.needsShipping) return [];
  const method = order.shippingMethod ? [order.shippingMethod.name] : [];
  if (order.shippingMethod?.pickup) return method;
  const { line1, city, province } = order.shippingAddress;
  return [...method, line1, [city, province].filter(Boolean).join(", ")].filter(Boolean);
}

/** The order in the workspace, on APP_URL: where the owner confirms the payment. */
function workspaceOrderUrl(store: StorefrontContext, number: number) {
  return `${env.APP_URL}${href("/app/:workspace/orders/:number", {
    workspace: store.store.slug,
    number: String(number),
  })}`;
}

/** Sends to every owner; one that fails doesn't stop the rest, and nothing here fails the order. */
async function tellOwners(
  store: StorefrontContext,
  order: ShopperOrder,
  kind: "placed" | "reference",
) {
  const owners = await storeOwnerContacts(store);
  await Promise.all(
    owners.map(async (owner) => {
      const lang = parseLocale(owner.locale) ?? parseLocale(store.store.locale) ?? defaultLocale;
      try {
        await mailer.send({
          to: owner.email,
          ...storeOrderMessage({
            locale: lang,
            kind,
            storeName: store.store.name,
            orderNumber: order.number,
            customerName: order.name,
            customerEmail: order.email,
            lines: orderLines(order, lang),
            total: formatPrice(order.total, order.currency, lang),
            reference: order.paymentReference,
            phone: order.phone,
            payment: emailT(lang)(`email.payment_${order.paymentMethod}`),
            delivery: deliveryLines(order),
            notes: order.shippingAddress.notes,
            payOnDelivery: order.paymentMethod === "cash",
            url: workspaceOrderUrl(store, order.number),
          }),
        });
      } catch (error) {
        console.error(`The store's notice of order #${order.number} didn't go out`, error);
      }
    }),
  );
}

/**
 * Right after checkout: the shopper's copy (what they bought, how to pay and the link back to
 * their order, which otherwise only the open tab has) and the owners' notice. Never awaited by
 * the checkout: an email that fails or is slow doesn't stop the order.
 */
export async function sendOrderPlacedEmails(
  store: StorefrontContext,
  token: string,
  shopperLocale: Locale,
  requestUrl: string,
): Promise<void> {
  const order = await getOrderByToken(store, token);
  if (!order) return;
  const url = `${storeOrigin(store.store.hostname, requestUrl)}${href("/orders/:token", { token })}`;
  await Promise.all([
    mailer
      .send({
        to: order.email,
        ...orderPlacedMessage({
          locale: shopperLocale,
          storeName: store.store.name,
          orderNumber: order.number,
          name: order.name,
          lines: orderLines(order, shopperLocale),
          total: formatPrice(order.total, order.currency, shopperLocale),
          payTo: order.payTo,
          delivery: deliveryLines(order),
          url,
        }),
      })
      .catch((error) => {
        console.error(`The confirmation of order #${order.number} didn't go out`, error);
      }),
    tellOwners(store, order, "placed"),
  ]);
}

/** The shopper sent their payment's reference: the owners check it and mark the order paid. */
export async function sendPaymentReferenceEmails(
  store: StorefrontContext,
  token: string,
): Promise<void> {
  const order = await getOrderByToken(store, token);
  if (order?.status !== "payment_submitted") return;
  await tellOwners(store, order, "reference");
}

/**
 * Tells the shopper their order moved (payment confirmed, sent or ready to pick up, cancelled),
 * with a new link to its page; replies go to the store's first owner. False when it couldn't go
 * out: the order changed all the same.
 */
export async function sendOrderUpdate(
  tenant: TenantContext,
  notice: OrderNotice,
  requestUrl: string,
): Promise<boolean> {
  const store = await storeIdentity(tenant);
  if (!store.hostname) return false;
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
  const url = `${storeOrigin(store.hostname, requestUrl)}${href("/orders/:token", { token: notice.token })}`;
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
        url,
      }),
    });
    return true;
  } catch (error) {
    console.error(`The ${notice.kind} email of order #${notice.number} didn't go out`, error);
    return false;
  }
}
