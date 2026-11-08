import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  matchTotp,
  totpCode,
  totpStep,
  totpUri,
} from "./totp";

// RFC 6238, appendix B: the SHA-1 secret is the ASCII of "12345678901234567890".
const rfcSecret = base32Encode(Buffer.from("12345678901234567890"));

describe("base32", () => {
  it("encodes like the authenticator apps read it, and back", () => {
    expect(rfcSecret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode("gezd gnbv-gy3tqojq gezdgnbvgy3tqojq").toString()).toBe(
      "12345678901234567890",
    );
  });
});

describe("totpCode", () => {
  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ])("matches the RFC's code at %i seconds", (seconds, code) => {
    expect(totpCode(rfcSecret, totpStep(new Date(seconds * 1000)))).toBe(code);
  });
});

describe("matchTotp", () => {
  const now = new Date(1111111109 * 1000);

  it("accepts the current code and gives its step", () => {
    expect(matchTotp(rfcSecret, "081804", now)).toBe(totpStep(now));
    expect(matchTotp(rfcSecret, "081 804", now)).toBe(totpStep(now));
  });

  it("forgives a phone clock one step off, not more", () => {
    const step = totpStep(now);
    expect(matchTotp(rfcSecret, totpCode(rfcSecret, step - 1), now)).toBe(step - 1);
    expect(matchTotp(rfcSecret, totpCode(rfcSecret, step + 1), now)).toBe(step + 1);
    expect(matchTotp(rfcSecret, totpCode(rfcSecret, step - 2), now)).toBeNull();
  });

  it("refuses what isn't six digits", () => {
    expect(matchTotp(rfcSecret, "08180", now)).toBeNull();
    expect(matchTotp(rfcSecret, "abcdef", now)).toBeNull();
  });
});

describe("generateTotpSecret", () => {
  it("makes 160 random bits each time", () => {
    const secret = generateTotpSecret();
    expect(base32Decode(secret)).toHaveLength(20);
    expect(secret).not.toBe(generateTotpSecret());
  });
});

describe("totpUri", () => {
  it("names the issuer and the account for the app", () => {
    expect(totpUri("ABC", "ana@tienda.test", "Monazhop")).toBe(
      "otpauth://totp/Monazhop%3Aana%40tienda.test?secret=ABC&issuer=Monazhop&digits=6",
    );
  });
});
