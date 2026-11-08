import { describe, expect, it } from "vitest";
import { magicLinkSchema, passwordSignInSchema, signUpSchema } from "./auth";

describe("magicLinkSchema", () => {
  it("lowercases and trims the email", () => {
    expect(magicLinkSchema.parse({ email: "  Ana@Example.COM " })).toEqual({
      email: "ana@example.com",
    });
  });

  it("answers with translation keys", () => {
    const result = magicLinkSchema.safeParse({ email: "ana" });
    expect(result.error?.issues[0]?.message).toBe("forms.emailInvalid");
  });
});

describe("signUpSchema", () => {
  it("asks for a password of at least 8 characters", () => {
    const result = signUpSchema.safeParse({ name: "Ana", email: "ana@example.com", password: "1" });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(["forms.passwordTooShort"]);
  });

  it("needs a name", () => {
    const result = signUpSchema.safeParse({
      name: "  ",
      email: "ana@example.com",
      password: "12345678",
    });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(["forms.nameRequired"]);
  });
});

describe("passwordSignInSchema", () => {
  it("doesn't judge the length of an existing password", () => {
    expect(passwordSignInSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
  });
});
