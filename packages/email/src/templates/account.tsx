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

/** The two emails of the password sign-in: confirm the email, or choose a new password. */
export type AccountEmailKind = "verify" | "reset";

export interface AccountEmailProps extends EmailBaseProps {
  kind: AccountEmailKind;
  name: string;
  url: string;
}

const keys = {
  verify: {
    subject: "email.verifySubject",
    heading: "email.verifyHeading",
    body: "email.verifyBody",
    button: "email.verifyButton",
    ignore: "email.verifyIgnore",
  },
  reset: {
    subject: "email.resetSubject",
    heading: "email.resetHeading",
    body: "email.resetBody",
    button: "email.resetButton",
    ignore: "email.resetIgnore",
  },
} as const;

export const accountEmailSubject = (kind: AccountEmailKind, locale: Locale) =>
  emailT(locale)(keys[kind].subject);

export function AccountEmail({ kind, locale = defaultLocale, name, url }: AccountEmailProps) {
  const t = emailT(locale);
  const text = keys[kind];
  return (
    <EmailLayout locale={locale} title={accountEmailSubject(kind, locale)} preview={t(text.body)}>
      <EmailHeading>{t(text.heading, { name })}</EmailHeading>
      <EmailText>{t(text.body)}</EmailText>
      <EmailButton href={url} locale={locale}>
        {t(text.button)}
      </EmailButton>
      <EmailNote>{t(text.ignore)}</EmailNote>
    </EmailLayout>
  );
}
