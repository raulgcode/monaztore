import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Secrets the app must use again later (a store's Hacienda password, its signing key) are
 * sealed with AES-256-GCM: `v1.<iv>.<tag>.<ciphertext>` in base64url. `key` is a secret from
 * `deriveSecret(BETTER_AUTH_SECRET, "…")`; changing BETTER_AUTH_SECRET makes them unreadable,
 * and the store has to enter them again.
 */
function keyBytes(key: string): Buffer {
  return createHash("sha256").update(key).digest();
}

export function sealSecret(key: string, plain: string | Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(key), iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

/** Throws if the value was changed or sealed with another key. */
export function openSecret(key: string, sealed: string): Buffer {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || data === undefined) throw new Error("Not a sealed secret");
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(key), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]);
}
