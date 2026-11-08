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

export interface MagicLinkEmailProps extends EmailBaseProps {
  url: string;
}

export const magicLinkSubject = (locale: Locale) => emailT(locale)("email.magicSubject");

export function MagicLinkEmail({ locale = defaultLocale, url }: MagicLinkEmailProps) {
  const t = emailT(locale);
  return (
    <EmailLayout locale={locale} title={magicLinkSubject(locale)} preview={t("email.magicBody")}>
      <EmailHeading>{t("email.magicHeading")}</EmailHeading>
      <EmailText>{t("email.magicBody")}</EmailText>
      <EmailButton href={url} locale={locale}>
        {t("email.magicButton")}
      </EmailButton>
      <EmailNote>{t("email.magicIgnore")}</EmailNote>
    </EmailLayout>
  );
}
