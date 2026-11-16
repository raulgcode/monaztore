import { createHmac, timingSafeEqual } from "node:crypto";
import { HONEYPOT_FIELD, STAMP_FIELD } from "./bot-guard-fields";

/**
 * The quiet locks of a public form, on top of its rate limits: a field people never see that
 * scripts fill (the honeypot), and the moment the page was shown, signed, since a script posts
 * the instant it loads the page or replays an old one. Neither asks anything of a person.
 */

export { HONEYPOT_FIELD, STAMP_FIELD };

/** A form open longer than this was left in a tab: still a person, so still taken. */
const STAMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const sign = (secret: string, value: string) =>
  createHmac("sha256", secret).update(value).digest("base64url");

/** `<ms>.<signature>`: when the form was shown, which nobody can make up or move. */
export function formStamp(secret: string, now = Date.now()): string {
  const value = String(now);
  return `${value}.${sign(secret, value)}`;
}

export type BotSignal = "honeypot" | "no_stamp" | "too_fast" | "stale";

/** Why this post looks like a script, or null for a person. */
export function botSignal(
  form: FormData,
  { secret, minFillMs, now = Date.now() }: { secret: string; minFillMs: number; now?: number },
): BotSignal | null {
  const trap = form.get(HONEYPOT_FIELD);
  if (typeof trap === "string" && trap.trim() !== "") return "honeypot";
  const stamp = form.get(STAMP_FIELD);
  if (typeof stamp !== "string") return "no_stamp";
  const [value = "", signature = ""] = stamp.split(".");
  const expected = Buffer.from(sign(secret, value));
  const given = Buffer.from(signature);
  if (
    !/^\d+$/.test(value) ||
    expected.length !== given.length ||
    !timingSafeEqual(expected, given)
  ) {
    return "no_stamp";
  }
  const age = now - Number(value);
  if (age < minFillMs) return "too_fast";
  if (age > STAMP_MAX_AGE_MS) return "stale";
  return null;
}

/** Cloudflare Turnstile's answer for the token the widget put in the form. */
export async function verifyTurnstile(
  secretKey: string,
  token: string,
  ip: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!token) return false;
  try {
    const response = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret: secretKey, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(5000),
    });
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}
