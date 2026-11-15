import {
  getOrderByToken,
  type ShopperOrder,
  type StorefrontContext,
  storeOwnerContacts,
} from "@monaztore/core";
import {
  emailT,
  type OrderEmailLine,
  orderPlacedMessage,
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
