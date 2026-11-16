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
  /** Cash on delivery: nothing to send ahead, the store's note on how. */
  cash?: { note: string };
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
  /** How it reaches them, already written: the option, then the address (or the pickup). */
  delivery?: string[];
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
  delivery = [],
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
      {delivery.length > 0 ? (
        <EmailText>
          {t("email.orderDelivery")}
          {delivery.map((line) => (
            <span key={line}>
              <br />
              {line}
            </span>
          ))}
        </EmailText>
      ) : null}
      {payTo.cash ? (
        <>
          <EmailText>{t("email.orderPayCash", { total })}</EmailText>
          {payTo.cash.note ? <EmailText>{payTo.cash.note}</EmailText> : null}
        </>
      ) : (
        <EmailText>{t("email.orderPayHow", { total })}</EmailText>
      )}
      {payTo.sinpe ? <EmailText>{t("email.orderPaySinpe", payTo.sinpe)}</EmailText> : null}
      {payTo.transfer ? <EmailText>{t("email.orderPayTransfer", payTo.transfer)}</EmailText> : null}
      <EmailButton href={url} locale={locale}>
        {t("email.orderPlacedButton")}
      </EmailButton>
      <EmailNote>
        {t(payTo.cash ? "email.orderPlacedNoteCash" : "email.orderPlacedNote", {
          number: String(orderNumber),
        })}
      </EmailNote>
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
  /** What the store needs to send it: phone, how they pay, where it goes and their notes. */
  phone?: string;
  payment?: string;
  delivery?: string[];
  notes?: string;
  /** Paid on delivery: the store sends it first and is paid when it arrives. */
  payOnDelivery?: boolean;
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
  phone,
  payment,
  delivery = [],
  notes,
  payOnDelivery = false,
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
      {kind === "placed" ? (
        <>
          {phone ? <EmailText>{t("email.storeOrderPhone", { phone })}</EmailText> : null}
          {payment ? <EmailText>{t("email.storeOrderPayment", { payment })}</EmailText> : null}
          {delivery.length > 0 ? (
            <EmailText>
              {t("email.orderDelivery")}
              {delivery.map((line) => (
                <span key={line}>
                  <br />
                  {line}
                </span>
              ))}
            </EmailText>
          ) : null}
          {notes ? <EmailText>{t("email.storeOrderNotes", { notes })}</EmailText> : null}
        </>
      ) : null}
      <EmailButton href={url} locale={locale}>
        {t("email.storeOrderButton")}
      </EmailButton>
      <EmailNote>
        {t(
          kind === "reference"
            ? "email.storeReferenceNote"
            : payOnDelivery
              ? "email.storeOrderNoteCash"
              : "email.storeOrderNote",
        )}
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
