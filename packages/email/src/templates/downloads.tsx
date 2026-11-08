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

/** A paid order's digital products: the link to the page that downloads them. */
export interface DownloadsEmailProps extends EmailBaseProps {
  storeName: string;
  orderNumber: number;
  name: string;
  /** `/downloads/:token` on the store's domain. */
  url: string;
  files: string[];
}

export const downloadsSubject = (storeName: string, orderNumber: number, locale: Locale) =>
  emailT(locale)("email.downloadsSubject", { store: storeName, number: String(orderNumber) });

export function DownloadsEmail({
  locale = defaultLocale,
  storeName,
  orderNumber,
  name,
  url,
  files,
}: DownloadsEmailProps) {
  const t = emailT(locale);
  return (
    <EmailLayout
      locale={locale}
      title={downloadsSubject(storeName, orderNumber, locale)}
      preview={t("email.downloadsBody", { store: storeName })}
    >
      <EmailHeading>{t("email.downloadsHeading", { name })}</EmailHeading>
      <EmailText>{t("email.downloadsBody", { store: storeName })}</EmailText>
      {files.map((file) => (
        <EmailText key={file}>• {file}</EmailText>
      ))}
      <EmailButton href={url} locale={locale}>
        {t("email.downloadsButton")}
      </EmailButton>
      <EmailNote>{t("email.downloadsNote")}</EmailNote>
    </EmailLayout>
  );
}

/** Subject and body together, for the sender. */
export function downloadsMessage(props: DownloadsEmailProps & { locale: Locale }) {
  return {
    subject: downloadsSubject(props.storeName, props.orderNumber, props.locale),
    react: <DownloadsEmail {...props} />,
  };
}
