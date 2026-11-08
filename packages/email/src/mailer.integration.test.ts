import { randomUUID } from "node:crypto";
import { emailEnvSchema, parseEnv } from "@monaztore/env";
import { createElement } from "react";
import { expect, it } from "vitest";
import { createMailer } from "./mailer";
import { MagicLinkEmail } from "./templates/magic-link";

const mailpitUrl = process.env.MAILPIT_URL ?? "http://localhost:8025";

it("delivers the magic link email through SMTP (Mailpit)", async () => {
  const mailer = createMailer(parseEnv(emailEnvSchema));
  const to = `${randomUUID()}@test.monaztore.com`;
  const url = "http://localhost:5173/api/auth/magic-link/verify?token=abc";

  await mailer.send({ to, subject: "Sign in", react: createElement(MagicLinkEmail, { url }) });

  const search = await fetch(`${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
  const { messages } = (await search.json()) as { messages: { ID: string }[] };
  expect(messages).toHaveLength(1);

  const message = await fetch(`${mailpitUrl}/api/v1/message/${messages[0]?.ID}`);
  const { HTML, Text } = (await message.json()) as { HTML: string; Text: string };
  expect(HTML).toContain(url.replace(/&/g, "&amp;"));
  expect(Text).toContain("Sign in with one tap");
});
