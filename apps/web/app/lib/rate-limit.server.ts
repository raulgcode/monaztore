import { clientAddress, hitRateLimit, type RateLimitRule } from "@monaztore/core";
import { db, env } from "./services.server";

const MINUTE = 60_000;

/**
 * What a visitor may ask for before they wait. Generous for a person, tight for a script. Every
 * action that sends an email to an address someone typed gets its rule here.
 */
export const rateLimits = {
  /** Sign-in emails (magic link, password reset, confirmation) from one IP. */
  signInIp: { limit: 10, windowMs: 15 * MINUTE },
  /** Sign-in emails to one address. */
  signInEmail: { limit: 5, windowMs: 15 * MINUTE },
  /** Password tries and sign-ups from one IP. */
  passwordIp: { limit: 20, windowMs: 15 * MINUTE },
  /** Password tries against one email (a password being guessed). */
  passwordEmail: { limit: 10, windowMs: 15 * MINUTE },
  /** Orders placed from one IP: a family buys a few, a script many. */
  orderIp: { limit: 10, windowMs: 15 * MINUTE },
  /** Hacienda sign-in checks from one workspace (Factura electrónica): a store retyping, not a guesser. */
  haciendaLogin: { limit: 10, windowMs: 15 * MINUTE },
  /** Hacienda's public lookups (an ID, the CABYS catalog) from one workspace. */
  haciendaLookup: { limit: 60, windowMs: 15 * MINUTE },
  /** The downloads email sent again for one order: the shopper asked, not a mail bomb. */
  downloadsEmail: { limit: 3, windowMs: 60 * MINUTE },
  /** Payment references sent from one IP. */
  paymentReferenceIp: { limit: 20, windowMs: 15 * MINUTE },
  /**
   * Second-step tries (the 6 digits or a passkey) by one person: a million possible codes and a
   * handful of tries per quarter hour keep a guesser out.
   */
  mfaCode: { limit: 10, windowMs: 15 * MINUTE },
} satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof rateLimits;

/** The caller's IP, from the header the platform's proxy sets (CLIENT_IP_HEADER). */
export function requestAddress(request: Request): string {
  return clientAddress(request.headers, env.CLIENT_IP_HEADER);
}

/**
 * Counts this request against each limit (`[name, who]`, e.g. `["signInIp", "203.0.113.7"]`).
 * False as soon as one is spent. Off with AUTH_RATE_LIMIT=off, like Better Auth's (e2e).
 */
export async function withinRateLimits(
  checks: ReadonlyArray<readonly [RateLimitName, string]>,
): Promise<boolean> {
  if (!env.AUTH_RATE_LIMIT) return true;
  let allowed = true;
  for (const [name, who] of checks) {
    const result = await hitRateLimit(db, `${name}:${who.toLowerCase()}`, rateLimits[name]);
    allowed &&= result.allowed;
  }
  return allowed;
}
