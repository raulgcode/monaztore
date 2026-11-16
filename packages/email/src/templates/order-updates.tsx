import { defaultLocale, type Locale } from "@monaztore/i18n";
import { emailT } from "../i18n";
import {
  type EmailBaseProps,
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailNote,
  EmailText,
} from "../layout";

/** What happened to the order since the shopper placed it. */
export type OrderUpdateKind = "paid" | "shipped" | "cancelled";

/**
 * The shopper hears of each step of their order: the store confirmed the payment, sent it (or it's
 * ready to pick up), or cancelled it. Each email brings the link back to the order's page.
 */
export interface OrderUpdateEmailProps extends EmailBaseProps {
  kind: OrderUpdateKind;
  storeName: string;
  orderNumber: number;
  name: string;
  /** The total, written with its currency. */
  total: string;
  /** The shipping option chosen, as the store named it. */
  shippingName: string | null;
  /** Picked up at the store: "ready to pick up" instead of "on its way". */
  pickup: boolean;
  trackingNumber: string | null;
  /** Paid on delivery and not paid yet: remind them to have the money ready. */
  payOnDelivery: boolean;
  /** `/orders/:token` on the store's domain. */
  url: string;
}

function subjectKey(kind: OrderUpdateKind, pickup: boolean) {
  if (kind === "paid") return "email.orderPaidSubject" as const;
  if (kind === "cancelled") return "email.orderCancelledSubject" as const;
  return pickup ? ("email.orderReadySubject" as const) : ("email.orderShippedSubject" as const);
}

export const orderUpdateSubject = (
  kind: OrderUpdateKind,
  storeName: string,
  orderNumber: number,
  pickup: boolean,
  locale: Locale,
) => emailT(locale)(subjectKey(kind, pickup), { store: storeName, number: String(orderNumber) });

export function OrderUpdateEmail({
  locale = defaultLocale,
  kind,
  storeName,
  orderNumber,
  name,
  total,
  shippingName,
  pickup,
  trackingNumber,
  payOnDelivery,
  url,
}: OrderUpdateEmailProps) {
  const t = emailT(locale);
  const subject = orderUpdateSubject(kind, storeName, orderNumber, pickup, locale);
  const values = {
    store: storeName,
    number: String(orderNumber),
    total,
    method: shippingName ?? "",
  };
  const body =
    kind === "paid"
      ? t(pickup ? "email.orderPaidBodyPickup" : "email.orderPaidBody", values)
      : kind === "cancelled"
        ? t("email.orderCancelledBody", values)
        : pickup
          ? t("email.orderReadyBody", values)
          : t(shippingName ? "email.orderShippedBody" : "email.orderShippedBodyPlain", values);
  return (
    <EmailLayout locale={locale} title={subject} preview={body}>
      <EmailHeading>{t("email.orderUpdateHeading", { name })}</EmailHeading>
      <EmailText>{body}</EmailText>
      {kind === "shipped" && trackingNumber ? (
        <EmailText>{t("email.orderTracking", { tracking: trackingNumber })}</EmailText>
      ) : null}
      {kind === "shipped" && payOnDelivery ? (
        <EmailText>
          {t(pickup ? "email.orderPayOnPickup" : "email.orderPayOnDelivery", values)}
        </EmailText>
      ) : null}
      <EmailButton href={url} locale={locale}>
        {t("email.orderPlacedButton")}
      </EmailButton>
      <EmailNote>{t("email.orderUpdateNote")}</EmailNote>
    </EmailLayout>
  );
}

/** Subject and body together, for the sender. */
export function orderUpdateMessage(props: OrderUpdateEmailProps & { locale: Locale }) {
  return {
    subject: orderUpdateSubject(
      props.kind,
      props.storeName,
      props.orderNumber,
      props.pickup,
      props.locale,
    ),
    react: <OrderUpdateEmail {...props} />,
  };
}
