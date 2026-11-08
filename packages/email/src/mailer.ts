import type { EmailEnv } from "@monaztore/env";
import { createTransport, type Transporter } from "nodemailer";
import type { ReactElement } from "react";
import { renderEmail } from "./render";

export interface SendEmailInput {
  to: string;
  subject: string;
  /** Where an answer goes, when not to EMAIL_FROM: support@ on replies, the sender on notices. */
  replyTo?: string;
  /** A template from this package: an `EmailLayout` in MJML. */
  react: ReactElement;
}

export interface Mailer {
  send(input: SendEmailInput): Promise<void>;
}

export function createMailer(env: EmailEnv, transporter?: Transporter): Mailer {
  const transport =
    transporter ??
    createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });

  return {
    async send({ to, subject, replyTo, react }) {
      const { html, text } = await renderEmail(react);
      await transport.sendMail({
        from: env.EMAIL_FROM,
        to,
        replyTo,
        subject,
        html,
        text,
      });
    },
  };
}
