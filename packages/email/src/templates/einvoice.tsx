import { defaultLocale, type Locale } from "@monaztore/i18n";
import { emailT } from "../i18n";
import { type EmailBaseProps, EmailHeading, EmailLayout, EmailNote, EmailText } from "../layout";

/** The buyer's electronic invoice or receipt, accepted by Hacienda, with its XML attached. */
export interface EinvoiceEmailProps extends EmailBaseProps {
  kind: "invoice" | "ticket";
  storeName: string;
  orderNumber: number;
  consecutive: string;
  clave: string;
}

export const einvoiceSubject = (
  kind: EinvoiceEmailProps["kind"],
  storeName: string,
  orderNumber: number,
  locale: Locale,
) =>
  emailT(locale)(kind === "invoice" ? "email.einvoiceSubject" : "email.eticketSubject", {
    store: storeName,
    number: String(orderNumber),
  });

export function EinvoiceEmail({
  locale = defaultLocale,
  kind,
  storeName,
  orderNumber,
  consecutive,
  clave,
}: EinvoiceEmailProps) {
  const t = emailT(locale);
  const subject = einvoiceSubject(kind, storeName, orderNumber, locale);
  return (
    <EmailLayout
      locale={locale}
      title={subject}
      preview={t("email.einvoiceBody", { store: storeName })}
    >
      <EmailHeading>{subject}</EmailHeading>
      <EmailText>{t("email.einvoiceBody", { store: storeName })}</EmailText>
      <EmailText>{t("email.einvoiceNumber", { consecutive })}</EmailText>
      <EmailNote>{t("email.einvoiceClave", { clave })}</EmailNote>
      <EmailNote>{t("email.einvoiceFiles")}</EmailNote>
    </EmailLayout>
  );
}

/** Subject and body together, for a sender that doesn't write JSX (the API's job). */
export function einvoiceMessage(props: EinvoiceEmailProps & { locale: Locale }) {
  return {
    subject: einvoiceSubject(props.kind, props.storeName, props.orderNumber, props.locale),
    react: <EinvoiceEmail {...props} />,
  };
}
