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

/** The owners' notice of a request a shopper sent from one of the store's pages. */
export interface StoreInquiryEmailProps extends EmailBaseProps {
  storeName: string;
  pageTitle: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  /** The store's Requests in the workspace. */
  url: string;
  /** The shopper's WhatsApp chat, when they gave a phone. */
  whatsappUrl: string | null;
}

export const storeInquirySubject = (storeName: string, name: string, locale: Locale) =>
  emailT(locale)("email.inquirySubject", { store: storeName, name });

export function StoreInquiryEmail({
  locale = defaultLocale,
  storeName,
  pageTitle,
  name,
  email,
  phone,
  message,
  url,
  whatsappUrl,
}: StoreInquiryEmailProps) {
  const t = emailT(locale);
  const subject = storeInquirySubject(storeName, name, locale);
  const body = t("email.inquiryBody", { name, email, page: pageTitle });
  return (
    <EmailLayout locale={locale} title={subject} preview={message.slice(0, 120)}>
      <EmailHeading>{subject}</EmailHeading>
      <EmailText>{body}</EmailText>
      <EmailText>
        {message.split("\n").map((line, index) => (
          <span key={`${index}-${line}`}>
            {index > 0 ? <br /> : null}
            {line}
          </span>
        ))}
      </EmailText>
      {phone ? <EmailText>{t("email.inquiryPhone", { phone })}</EmailText> : null}
      {whatsappUrl ? (
        <EmailText>
          <a href={whatsappUrl}>{t("email.inquiryWhatsapp")}</a>
        </EmailText>
      ) : null}
      <EmailButton href={url} locale={locale}>
        {t("email.inquiryButton")}
      </EmailButton>
      <EmailNote>{t("email.inquiryNote")}</EmailNote>
    </EmailLayout>
  );
}

/** Subject and body together, for the sender. */
export function storeInquiryMessage(props: StoreInquiryEmailProps & { locale: Locale }) {
  return {
    subject: storeInquirySubject(props.storeName, props.name, props.locale),
    react: <StoreInquiryEmail {...props} />,
  };
}
