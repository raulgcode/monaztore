import { createHmac, randomBytes } from "node:crypto";

// Authenticator-app codes (TOTP, RFC 6238): what Google Authenticator, 1Password or Authy
// show. Six digits that change every 30 seconds, from a secret shared once with a QR.

const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error("Invalid base32 secret");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** A new secret: 160 random bits, as the apps expect, in base32. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The 30-second step a moment falls in. */
export function totpStep(now: Date = new Date()): number {
  return Math.floor(now.getTime() / 1000 / STEP_SECONDS);
}

/** The code the app shows for a step (RFC 4226 with HMAC-SHA1, the apps' default). */
export function totpCode(secret: string, step: number = totpStep()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 15;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/**
 * The step of a code that matches now or one step either side (a phone's clock a little off),
 * or null. The caller keeps the step so the same code never works twice.
 */
export function matchTotp(secret: string, code: string, now: Date = new Date()): number | null {
  const digits = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(digits)) return null;
  const current = totpStep(now);
  for (const step of [current - 1, current, current + 1]) {
    if (totpCode(secret, step) === digits) return step;
  }
  return null;
}

/** The link the QR holds: the app shows "<issuer> (ana@…)" and starts making codes. */
export function totpUri(secret: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, digits: String(DIGITS) });
  return `otpauth://totp/${label}?${params}`;
}
