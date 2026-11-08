import { describe, expect, it } from "vitest";
import { planSecrets } from "./secrets";

const production = {
  DATABASE_URL: "postgres://fly-user:pw@direct.abc123.flympg.net/fly-db",
  BETTER_AUTH_SECRET: "p".repeat(44),
  SMTP_HOST: "smtp.resend.com",
  SMTP_PORT: "465",
  SMTP_USER: "resend",
  SMTP_PASSWORD: "re_123",
  SMTP_SECURE: "true",
  EMAIL_FROM: "Monaztore <support@monaztore.com>",
};

describe("planSecrets", () => {
  it("sends a complete production .env without problems", () => {
    const plan = planSecrets(production);
    expect(plan.problems).toEqual([]);
    expect(plan.secrets).toEqual(production);
  });

  it("leaves out what fly.toml sets, local tools and empty values", () => {
    const plan = planSecrets({
      ...production,
      APP_URL: "http://localhost:5173",
      CLIENT_IP_HEADER: "fly-client-ip",
      TEST_DATABASE_URL: "postgres://localhost/test",
      MAILPIT_URL: "http://localhost:8025",
      GOOGLE_CLIENT_ID: "",
    });
    expect(plan.problems).toEqual([]);
    expect(Object.keys(plan.secrets)).not.toContain("APP_URL");
    expect(plan.skipped.map((entry) => entry.key)).toEqual([
      "APP_URL",
      "CLIENT_IP_HEADER",
      "TEST_DATABASE_URL",
      "MAILPIT_URL",
      "GOOGLE_CLIENT_ID",
    ]);
  });

  it("refuses the development values", () => {
    const plan = planSecrets(
      {
        ...production,
        DATABASE_URL: "postgres://monaztore:monaztore@localhost:5432/monaztore",
        SMTP_HOST: "localhost",
        SMTP_PORT: "1025",
        AUTH_RATE_LIMIT: "off",
      },
      { localAuthSecret: production.BETTER_AUTH_SECRET },
    );
    expect(plan.problems).toEqual([
      expect.stringMatching(/^DATABASE_URL/),
      expect.stringMatching(/^BETTER_AUTH_SECRET is the same/),
      expect.stringMatching(/^SMTP_/),
      expect.stringMatching(/^AUTH_RATE_LIMIT/),
    ]);
  });

  it("asks for what production can't run without", () => {
    const { DATABASE_URL, BETTER_AUTH_SECRET, EMAIL_FROM, ...rest } = production;
    expect(planSecrets(rest).problems).toEqual([
      expect.stringMatching(/^DATABASE_URL is missing/),
      expect.stringMatching(/^BETTER_AUTH_SECRET is missing/),
      expect.stringMatching(/^EMAIL_FROM is missing/),
    ]);
  });
});
