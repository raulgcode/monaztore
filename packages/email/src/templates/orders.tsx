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

/** One line of the order, already written for the reader: "Mug × 2" and "₡12 000". */
export interface OrderEmailLine {
  label: string;
  total: string;
}

/** Where the shopper sends the money, for the method they chose. */
export interface OrderEmailPayTo {
  sinpe?: { phone: string; holder: string };
  transfer?: { bank: string; iban: string; holder: string };
}

/** The shopper's copy of the order they just placed: what they bought, how to pay, its page. */
export interface OrderPlacedEmailProps extends EmailBaseProps {
  storeName: string;
  orderNumber: number;
  name: string;
  lines: OrderEmailLine[];
  /** The total, written with its currency. */
  total: string;
  payTo: OrderEmailPayTo;
  /** `/orders/:token` on the store's domain: their only way back to the order. */
  url: string;
}

export const orderPlacedSubject = (storeName: string, orderNumber: number, locale: Locale) =>
  emailT(locale)("email.orderPlacedSubject", { store: storeName, number: String(orderNumber) });

export function OrderPlacedEmail({
  locale = defaultLocale,
  storeName,
  orderNumber,
  name,
  lines,
  total,
  payTo,
  url,
}: OrderPlacedEmailProps) {
  const t = emailT(locale);
  return (
    <EmailLayout
      locale={locale}
      title={orderPlacedSubject(storeName, orderNumber, locale)}
      preview={t("email.orderPlacedBody", { store: storeName, number: String(orderNumber) })}
    >
      <EmailHeading>{t("email.orderPlacedHeading", { name })}</EmailHeading>
      <EmailText>
        {t("email.orderPlacedBody", { store: storeName, number: String(orderNumber) })}
      </EmailText>
      {lines.map((line) => (
        <EmailText key={line.label}>
          • {line.label}: {line.total}
        </EmailText>
      ))}
      <EmailText>{t("email.orderTotal", { total })}</EmailText>
      <EmailText>{t("email.orderPayHow", { total })}</EmailText>
      {payTo.sinpe ? <EmailText>{t("email.orderPaySinpe", payTo.sinpe)}</EmailText> : null}
      {payTo.transfer ? <EmailText>{t("email.orderPayTransfer", payTo.transfer)}</EmailText> : null}
      <EmailButton href={url} locale={locale}>
        {t("email.orderPlacedButton")}
      </EmailButton>
      <EmailNote>{t("email.orderPlacedNote", { number: String(orderNumber) })}</EmailNote>
    </EmailLayout>
  );
}

/** Subject and body together, for the sender. */
export function orderPlacedMessage(props: OrderPlacedEmailProps & { locale: Locale }) {
  return {
    subject: orderPlacedSubject(props.storeName, props.orderNumber, props.locale),
    react: <OrderPlacedEmail {...props} />,
  };
}

/**
 * The store's notice: a new order came in (`placed`) or the shopper sent the reference of their
 * payment (`reference`), which the store checks and confirms in the order.
 */
export interface StoreOrderEmailProps extends EmailBaseProps {
  kind: "placed" | "reference";
  storeName: string;
  orderNumber: number;
  customerName: string;
  customerEmail: string;
  lines: OrderEmailLine[];
  total: string;
  /** The payment reference the shopper typed, for `reference`. */
  reference?: string | null;
  /** The order in the workspace. */
  url: string;
}

export const storeOrderSubject = (
  kind: StoreOrderEmailProps["kind"],
  storeName: string,
  orderNumber: number,
  locale: Locale,
) =>
  emailT(locale)(kind === "placed" ? "email.storeOrderSubject" : "email.storeReferenceSubject", {
    store: storeName,
    number: String(orderNumber),
  });

export function StoreOrderEmail({
  locale = defaultLocale,
  kind,
  storeName,
  orderNumber,
  customerName,
  customerEmail,
  lines,
  total,
  reference,
  url,
}: StoreOrderEmailProps) {
  const t = emailT(locale);
  const subject = storeOrderSubject(kind, storeName, orderNumber, locale);
  const body =
    kind === "placed"
      ? t("email.storeOrderBody", { name: customerName, email: customerEmail, total })
      : t("email.storeReferenceBody", {
          name: customerName,
          total,
          reference: reference ?? "",
        });
  return (
    <EmailLayout locale={locale} title={subject} preview={body}>
      <EmailHeading>{subject}</EmailHeading>
      <EmailText>{body}</EmailText>
      {lines.map((line) => (
        <EmailText key={line.label}>
          • {line.label}: {line.total}
        </EmailText>
      ))}
      <EmailButton href={url} locale={locale}>
        {t("email.storeOrderButton")}
      </EmailButton>
      <EmailNote>
        {t(kind === "placed" ? "email.storeOrderNote" : "email.storeReferenceNote")}
      </EmailNote>
    </EmailLayout>
  );
}

/** Subject and body together, for the sender. */
export function storeOrderMessage(props: StoreOrderEmailProps & { locale: Locale }) {
  return {
    subject: storeOrderSubject(props.kind, props.storeName, props.orderNumber, props.locale),
    react: <StoreOrderEmail {...props} />,
  };
}
