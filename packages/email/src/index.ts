export { type EmailPalette, emailPalette, type ThemeColor } from "./brand";
export { emailT } from "./i18n";
export {
  type EmailBaseProps,
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailNote,
  EmailText,
} from "./layout";
export {
  createMailer,
  type EmailAttachment,
  type Mailer,
  type SendEmailInput,
} from "./mailer";
export { type RenderedEmail, renderEmail } from "./render";
export {
  AccountEmail,
  type AccountEmailKind,
  type AccountEmailProps,
  accountEmailSubject,
} from "./templates/account";
export {
  DownloadsEmail,
  type DownloadsEmailProps,
  downloadsMessage,
  downloadsSubject,
} from "./templates/downloads";
export {
  EinvoiceEmail,
  type EinvoiceEmailProps,
  einvoiceMessage,
  einvoiceSubject,
} from "./templates/einvoice";
export { MagicLinkEmail, type MagicLinkEmailProps, magicLinkSubject } from "./templates/magic-link";
