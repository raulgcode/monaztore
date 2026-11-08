import { expect } from "@playwright/test";

const mailpitUrl = process.env.MAILPIT_URL ?? "http://localhost:8025";

interface MailpitSummary {
  ID: string;
  Subject: string;
}

/**
 * Waits for the newest email sent to `to`, or, with `subject`, for the newest one with that
 * subject: an email sent after others (a billing notice after the sign-in link) may take a while.
 */
export async function getEmail(
  to: string,
  { subject, timeout = 10_000 }: { subject?: string; timeout?: number } = {},
): Promise<{ Subject: string; Text: string }> {
  let messageId: string | undefined;
  let subjects: string[] = [];
  await expect
    .poll(
      async () => {
        const query = encodeURIComponent(`to:${to}`);
        const response = await fetch(`${mailpitUrl}/api/v1/search?query=${query}`);
        const { messages } = (await response.json()) as { messages: MailpitSummary[] };
        subjects = messages.map((message) => message.Subject);
        messageId = messages.find((message) => !subject || message.Subject === subject)?.ID;
        return messageId;
      },
      { timeout },
    )
    .toBeTruthy()
    .catch(() => {
      const wanted = subject ? ` with subject "${subject}"` : "";
      throw new Error(
        `email to ${to}${wanted} never arrived in Mailpit (got: ${subjects.join(" · ") || "nothing"})`,
      );
    });

  const response = await fetch(`${mailpitUrl}/api/v1/message/${messageId}`);
  return (await response.json()) as { Subject: string; Text: string };
}

/**
 * Waits for the newest email sent to `to` (with `subject`, if given) and returns its first link pointing at `baseURL`. Takes
 * the `baseURL` fixture as is: without one, an empty pattern would match any word of the email.
 */
export async function getLinkFromEmail(
  to: string,
  baseURL: string | undefined,
  subject?: string,
): Promise<string> {
  if (!baseURL) throw new Error("baseURL is not set in playwright.config.ts");
  const { Text } = await getEmail(to, { subject });
  const link = Text.match(new RegExp(`${baseURL}[^\\s\\]]+`))?.[0];
  if (!link) throw new Error(`No link to ${baseURL} in email to ${to}`);
  return link;
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}@e2e.monaztore.test`;
}
