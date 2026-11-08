import { describe, expect, it } from "vitest";
import { buildEnvFile, parseEnvKeys, setEnvValue } from "./env-file";

const example = [
  "# Comentario",
  "DATABASE_URL=postgres://localhost/monaztore",
  "",
  "BETTER_AUTH_SECRET=change-me-to-a-long-random-string",
  "SMTP_USER=",
].join("\n");

const generators = { BETTER_AUTH_SECRET: () => "generated-secret" };

describe("parseEnvKeys", () => {
  it("reads keys and values, ignoring comments and blank lines", () => {
    expect(parseEnvKeys(example)).toEqual(
      new Map([
        ["DATABASE_URL", "postgres://localhost/monaztore"],
        ["BETTER_AUTH_SECRET", "change-me-to-a-long-random-string"],
        ["SMTP_USER", ""],
      ]),
    );
  });
});

describe("buildEnvFile", () => {
  it("copies the example and fills secrets when there is no .env yet", () => {
    const result = buildEnvFile({ example, current: undefined, generators });

    expect(result.content).toContain("DATABASE_URL=postgres://localhost/monaztore");
    expect(result.content).toContain("BETTER_AUTH_SECRET=generated-secret");
    expect(result.content).toContain("# Comentario");
    expect(result.added).toEqual(["DATABASE_URL", "BETTER_AUTH_SECRET", "SMTP_USER"]);
    expect(result.generated).toEqual(["BETTER_AUTH_SECRET"]);
  });

  it("never touches values the developer already set", () => {
    const current = "DATABASE_URL=postgres://mine\nBETTER_AUTH_SECRET=my-own-secret\nSMTP_USER=\n";

    const result = buildEnvFile({ example, current, generators });

    expect(result.content).toBe(current);
    expect(result.added).toEqual([]);
    expect(result.generated).toEqual([]);
  });

  it("appends keys that are new in the example", () => {
    const current = "DATABASE_URL=postgres://mine\nBETTER_AUTH_SECRET=my-own-secret\n";

    const result = buildEnvFile({ example, current, generators });

    expect(result.content).toMatch(/^DATABASE_URL=postgres:\/\/mine\n/);
    expect(result.content).toContain("\nSMTP_USER=\n");
    expect(result.added).toEqual(["SMTP_USER"]);
  });

  it("replaces a secret that still has the placeholder or is empty", () => {
    const current =
      "DATABASE_URL=x\nBETTER_AUTH_SECRET=change-me-to-a-long-random-string\nSMTP_USER=\n";

    const result = buildEnvFile({ example, current, generators });

    expect(result.content).toContain("BETTER_AUTH_SECRET=generated-secret");
    expect(result.content).not.toContain("change-me");
    expect(result.generated).toEqual(["BETTER_AUTH_SECRET"]);
  });
});

describe("setEnvValue", () => {
  it("replaces the value of an existing key", () => {
    expect(setEnvValue("A=1\nSUPER_ADMIN_EMAILS=\nB=2\n", "SUPER_ADMIN_EMAILS", "yo@x.com")).toBe(
      "A=1\nSUPER_ADMIN_EMAILS=yo@x.com\nB=2\n",
    );
  });

  it("appends the key when it is missing", () => {
    expect(setEnvValue("A=1", "SUPER_ADMIN_EMAILS", "yo@x.com")).toBe(
      "A=1\nSUPER_ADMIN_EMAILS=yo@x.com\n",
    );
  });
});
