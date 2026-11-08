import {
  Mjml,
  MjmlAll,
  MjmlAttributes,
  MjmlBody,
  MjmlButton,
  MjmlColumn,
  MjmlHead,
  MjmlPreview,
  MjmlRaw,
  MjmlSection,
  MjmlStyle,
  MjmlText,
  MjmlTitle,
} from "@faire/mjml-react";
import { defaultLocale, type Locale } from "@monaztore/i18n";
import type { ReactNode } from "react";
import { type EmailPalette, emailPalette as palette } from "./brand";
import { emailT } from "./i18n";

/** What every email takes besides its own content. */
export interface EmailBaseProps {
  /** The recipient's language. */
  locale?: Locale;
}

const fontFamily = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

/**
 * The frame of every email, in MJML so it holds up in Gmail, Outlook and Apple Mail: the brand
 * color with the app's name on top, a card with the content and a footer. It follows the light or
 * dark mode of the mail app where it can (`prefers-color-scheme`); elsewhere it stays light.
 */
export function EmailLayout({
  locale = defaultLocale,
  title,
  preview,
  children,
}: EmailBaseProps & { title: string; preview: string; children: ReactNode }) {
  const t = emailT(locale);
  return (
    <Mjml lang={locale}>
      <MjmlHead>
        <MjmlTitle>{title}</MjmlTitle>
        <MjmlPreview>{preview}</MjmlPreview>
        <MjmlAttributes>
          <MjmlAll fontFamily={fontFamily} />
          <MjmlText
            color={palette.text.light}
            fontSize="16px"
            lineHeight="1.5"
            padding="0 0 16px"
          />
        </MjmlAttributes>
        <MjmlRaw
          dangerouslySetInnerHTML={{
            __html:
              '<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">',
          }}
        />
        <MjmlStyle>{darkModeCss(palette)}</MjmlStyle>
      </MjmlHead>
      <MjmlBody backgroundColor={palette.page.light} width={560} cssClass="app-page">
        <MjmlSection padding="24px 16px 0">
          <MjmlColumn
            backgroundColor={palette.primary.light}
            borderRadius="16px 16px 0 0"
            cssClass="app-header"
            padding="20px 32px"
          >
            <MjmlText
              color={palette.primaryForeground.light}
              cssClass="app-header-text"
              fontSize="20px"
              fontWeight="700"
              padding="0"
            >
              {t("common.appName")}
            </MjmlText>
          </MjmlColumn>
        </MjmlSection>
        <MjmlSection padding="0 16px">
          <MjmlColumn
            backgroundColor={palette.card.light}
            borderRadius="0 0 16px 16px"
            cssClass="app-card"
            padding="32px 32px 16px"
          >
            {children}
          </MjmlColumn>
        </MjmlSection>
        <MjmlSection padding="16px 16px 32px">
          <MjmlColumn>
            <MjmlText
              align="center"
              color={palette.muted.light}
              cssClass="app-muted"
              fontSize="12px"
            >
              {t("email.footer")}
            </MjmlText>
          </MjmlColumn>
        </MjmlSection>
      </MjmlBody>
    </Mjml>
  );
}

export function EmailHeading({ children }: { children: ReactNode }) {
  return (
    <MjmlText fontSize="24px" fontWeight="700" lineHeight="1.25" cssClass="app-text">
      {children}
    </MjmlText>
  );
}

export function EmailText({ children }: { children: ReactNode }) {
  return <MjmlText cssClass="app-text">{children}</MjmlText>;
}

/** Small print under the button: why they got it, what to do if it wasn't them. */
export function EmailNote({ children }: { children: ReactNode }) {
  return (
    <MjmlText color={palette.muted.light} fontSize="13px" cssClass="app-muted">
      {children}
    </MjmlText>
  );
}

/** The one action of the email, with the link spelled out below for when the button fails. */
export function EmailButton({
  href,
  locale = defaultLocale,
  children,
}: {
  href: string;
  locale?: Locale;
  children: ReactNode;
}) {
  const t = emailT(locale);
  return (
    <>
      <MjmlButton
        href={href}
        align="left"
        backgroundColor={palette.primary.light}
        color={palette.primaryForeground.light}
        borderRadius="12px"
        fontSize="16px"
        fontWeight="600"
        innerPadding="14px 24px"
        padding="8px 0 24px"
        cssClass="app-button"
      >
        {children}
      </MjmlButton>
      <MjmlText color={palette.muted.light} fontSize="13px" cssClass="app-muted app-fallback">
        {t("email.linkFallback")}
        <br />
        <a
          href={href}
          className="app-link"
          style={{ color: palette.link.light, wordBreak: "break-all" }}
        >
          {href}
        </a>
      </MjmlText>
    </>
  );
}

/** Dark mode for the mail apps that support it (Apple Mail, Outlook for Mac, Samsung, …). */
function darkModeCss(colors: EmailPalette): string {
  const dark = (color: keyof EmailPalette) => `${colors[color].dark} !important`;
  return `
    @media (prefers-color-scheme: dark) {
      body, .app-page, .app-page > div { background-color: ${dark("page")}; }
      .app-header > table > tbody > tr > td { background-color: ${dark("primary")}; }
      .app-header-text div { color: ${dark("primaryForeground")}; }
      .app-card > table > tbody > tr > td { background-color: ${dark("card")}; }
      .app-text div { color: ${dark("text")}; }
      .app-muted div { color: ${dark("muted")}; }
      .app-link { color: ${dark("link")}; }
      .app-button table td, .app-button a { background-color: ${dark("primary")}; color: ${dark("primaryForeground")}; }
    }`;
}
