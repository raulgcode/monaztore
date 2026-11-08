import { describe, expect, it } from "vitest";
import { openSecret, sealSecret } from "./sealed";

describe("sealed secrets", () => {
  const key = "a-key-derived-from-better-auth-secret";

  it("opens what it sealed, text or bytes", () => {
    expect(openSecret(key, sealSecret(key, "contraseña")).toString()).toBe("contraseña");
    const bytes = Buffer.from([0, 1, 2, 250]);
    expect(openSecret(key, sealSecret(key, bytes))).toEqual(bytes);
  });

  it("never shows the secret and seals it differently every time", () => {
    const sealed = sealSecret(key, "contraseña");
    expect(sealed).not.toContain("contraseña");
    expect(sealSecret(key, "contraseña")).not.toBe(sealed);
  });

  it("refuses another key or a changed value", () => {
    const sealed = sealSecret(key, "contraseña");
    expect(() => openSecret("another-key", sealed)).toThrow();
    expect(() => openSecret(key, `${sealed.slice(0, -2)}AA`)).toThrow();
  });
});
