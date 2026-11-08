import { describe, expect, it } from "vitest";
import {
  deriveSecret,
  EXAMPLE_AUTH_SECRET,
  emailEnvSchema,
  googleCredentials,
  parseEnv,
  serverEnvSchema,
  superAdminEnvSchema,
} from "./index";

const base = {
  APP_URL: "http://localhost:5173",
  API_URL: "http://localhost:3001",
  BETTER_AUTH_SECRET: "x".repeat(32),
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  SMTP_HOST: "localhost",
  SMTP_PORT: "1025",
  EMAIL_FROM: "Monaztore <hello@monaztore.com>",
};

describe("parseEnv", () => {
  it("coerces SMTP values", () => {
    const env = parseEnv(emailEnvSchema, { ...base, SMTP_SECURE: "true" });
    expect(env).toMatchObject({ SMTP_PORT: 1025, SMTP_SECURE: true });
  });

  it("enables Google only when both credentials are set", () => {
    const parse = (extra: Record<string, string>) =>
      googleCredentials(parseEnv(serverEnvSchema, { ...base, ...extra }));

    expect(parse({})).toBeUndefined();
    expect(parse({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "" })).toBeUndefined();
    expect(parse({ GOOGLE_CLIENT_ID: " id ", GOOGLE_CLIENT_SECRET: "secret" })).toEqual({
      clientId: "id",
      clientSecret: "secret",
    });
  });

  it("signs in with the magic link unless AUTH_METHODS picks others", () => {
    expect(parseEnv(serverEnvSchema, base).AUTH_METHODS).toEqual(["magic-link"]);
    const env = parseEnv(serverEnvSchema, { ...base, AUTH_METHODS: " password , magic-link" });
    expect(env.AUTH_METHODS).toEqual(["magic-link", "password"]);
  });

  it("refuses an unknown method, an empty list and Google without its credentials", () => {
    expect(() => parseEnv(serverEnvSchema, { ...base, AUTH_METHODS: "facebook" })).toThrow(
      /Unknown sign-in method: facebook/,
    );
    expect(() => parseEnv(serverEnvSchema, { ...base, AUTH_METHODS: " , " })).toThrow(
      /at least one/,
    );
    expect(() => parseEnv(serverEnvSchema, { ...base, AUTH_METHODS: "google" })).toThrow(
      /GOOGLE_CLIENT_ID/,
    );
    const google = { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" };
    expect(
      parseEnv(serverEnvSchema, { ...base, ...google, AUTH_METHODS: "google" }).AUTH_METHODS,
    ).toEqual(["google"]);
  });

  it("keeps auth rate limiting on unless AUTH_RATE_LIMIT=off", () => {
    expect(parseEnv(serverEnvSchema, base).AUTH_RATE_LIMIT).toBe(true);
    expect(parseEnv(serverEnvSchema, { ...base, AUTH_RATE_LIMIT: "off" }).AUTH_RATE_LIMIT).toBe(
      false,
    );
  });

  it("refuses the example secret anywhere but this machine", () => {
    const local = { ...base, BETTER_AUTH_SECRET: EXAMPLE_AUTH_SECRET };
    expect(parseEnv(serverEnvSchema, local).BETTER_AUTH_SECRET).toBe(EXAMPLE_AUTH_SECRET);
    expect(() =>
      parseEnv(serverEnvSchema, { ...local, APP_URL: "https://app.monaztore.com" }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("reads the caller's IP from Fly.io's header unless told otherwise", () => {
    expect(parseEnv(serverEnvSchema, base).CLIENT_IP_HEADER).toBe("fly-client-ip");
    expect(
      parseEnv(serverEnvSchema, { ...base, CLIENT_IP_HEADER: "CF-Connecting-IP" }).CLIENT_IP_HEADER,
    ).toBe("cf-connecting-ip");
  });

  it("derives a different key for each purpose", () => {
    const secret = "s".repeat(32);
    expect(deriveSecret(secret, "cookies")).toBe(deriveSecret(secret, "cookies"));
    expect(deriveSecret(secret, "cookies")).not.toBe(deriveSecret(secret, "other"));
    expect(deriveSecret(secret, "cookies")).not.toContain(secret);
  });

  it("lists every invalid variable", () => {
    expect(() => parseEnv(serverEnvSchema, {})).toThrow(/APP_URL[\s\S]*DATABASE_URL/);
  });
});

describe("SUPER_ADMIN_EMAILS", () => {
  it("reads a comma-separated list, lowercased and without blanks", () => {
    expect(
      parseEnv(superAdminEnvSchema, { SUPER_ADMIN_EMAILS: " Raul@Example.com, ,ana@x.test " }),
    ).toEqual({ SUPER_ADMIN_EMAILS: ["raul@example.com", "ana@x.test"] });
    expect(parseEnv(superAdminEnvSchema, {})).toEqual({ SUPER_ADMIN_EMAILS: [] });
  });
});
