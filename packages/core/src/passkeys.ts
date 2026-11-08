import { and, asc, count, eq, schema } from "@monaztore/db";
import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { DomainError } from "./errors";
import { type MfaActor, markVerified } from "./mfa";
import { recordAudit } from "./platform-audit";

/** The browser has this long to sign a challenge; then the page asks for a new one. */
export const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;
/** A phone, a laptop and a couple of security keys fit with room to spare. */
export const PASSKEYS_MAX = 10;

/**
 * Who asks for the passkey: the panel's host (`APP_URL`). A passkey only works on the host it
 * was made for, and the browser says which page asked, so the response can't be replayed
 * from another site.
 */
export interface PasskeyRelyingParty {
  id: string;
  origin: string;
  name: string;
}

export interface Passkey {
  id: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

type ChallengePurpose = "register" | "verify";

async function saveChallenge(
  actor: MfaActor,
  sessionId: string,
  purpose: ChallengePurpose,
  challenge: string,
  now: Date,
) {
  const expiresAt = new Date(now.getTime() + PASSKEY_CHALLENGE_TTL_MS);
  await actor.db
    .insert(schema.passkeyChallenge)
    .values({ sessionId, purpose, challenge, expiresAt })
    .onConflictDoUpdate({
      target: [schema.passkeyChallenge.sessionId, schema.passkeyChallenge.purpose],
      set: { challenge, expiresAt },
    });
}

/** The session's challenge, crossed out as it is read: each one is signed once. */
async function takeChallenge(
  actor: MfaActor,
  sessionId: string,
  purpose: ChallengePurpose,
  now: Date,
): Promise<string | null> {
  const [row] = await actor.db
    .delete(schema.passkeyChallenge)
    .where(
      and(
        eq(schema.passkeyChallenge.sessionId, sessionId),
        eq(schema.passkeyChallenge.purpose, purpose),
      ),
    )
    .returning({
      challenge: schema.passkeyChallenge.challenge,
      expiresAt: schema.passkeyChallenge.expiresAt,
    });
  return row && row.expiresAt > now ? row.challenge : null;
}

const passkeyColumns = {
  id: schema.passkey.id,
  name: schema.passkey.name,
  createdAt: schema.passkey.createdAt,
  lastUsedAt: schema.passkey.lastUsedAt,
};

export async function listPasskeys(actor: MfaActor): Promise<Passkey[]> {
  return actor.db
    .select(passkeyColumns)
    .from(schema.passkey)
    .where(eq(schema.passkey.userId, actor.userId))
    .orderBy(asc(schema.passkey.createdAt));
}

/**
 * What the browser needs to make a passkey for this person, without repeating one they already
 * have on that device. The challenge stays with the session until the response comes back.
 */
export async function passkeyRegistrationOptions(
  actor: MfaActor,
  rp: PasskeyRelyingParty,
  { sessionId, userName }: { sessionId: string; userName: string },
  now: Date = new Date(),
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const existing = await actor.db
    .select({ id: schema.passkey.id, transports: schema.passkey.transports })
    .from(schema.passkey)
    .where(eq(schema.passkey.userId, actor.userId));
  const options = await generateRegistrationOptions({
    rpName: rp.name,
    rpID: rp.id,
    userName,
    userID: new TextEncoder().encode(actor.userId),
    attestationType: "none",
    excludeCredentials: existing,
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
  await saveChallenge(actor, sessionId, "register", options.challenge, now);
  return options;
}

/**
 * Keeps the passkey the browser just made, if it signed this session's challenge for our host.
 * Null when it didn't (an old page, another site, a forged response); the log records the new one.
 */
export async function addPasskey(
  actor: MfaActor,
  rp: PasskeyRelyingParty,
  input: { sessionId: string; name: string; response: RegistrationResponseJSON },
  now: Date = new Date(),
): Promise<Passkey | null> {
  const challenge = await takeChallenge(actor, input.sessionId, "register", now);
  if (!challenge) return null;
  const [{ value: total } = { value: 0 }] = await actor.db
    .select({ value: count() })
    .from(schema.passkey)
    .where(eq(schema.passkey.userId, actor.userId));
  if (total >= PASSKEYS_MAX) {
    throw new DomainError("passkeys_limit", "Too many passkeys");
  }
  const verification = await verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: challenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.id,
    requireUserVerification: false,
  }).catch(() => null);
  if (!verification?.verified) return null;

  const { credential } = verification.registrationInfo;
  const [passkey] = await actor.db
    .insert(schema.passkey)
    .values({
      id: credential.id,
      userId: actor.userId,
      name: input.name,
      publicKey: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning(passkeyColumns);
  if (!passkey) return null;
  await recordAudit(actor.db, {
    actorUserId: actor.userId,
    action: "passkey_added",
    targetUserId: actor.userId,
    details: { name: passkey.name },
  });
  return passkey;
}

/** Forgets one of the person's own passkeys; someone else's id does nothing. */
export async function removePasskey(actor: MfaActor, id: string): Promise<void> {
  const [removed] = await actor.db
    .delete(schema.passkey)
    .where(and(eq(schema.passkey.id, id), eq(schema.passkey.userId, actor.userId)))
    .returning({ name: schema.passkey.name });
  if (!removed) return;
  await recordAudit(actor.db, {
    actorUserId: actor.userId,
    action: "passkey_removed",
    targetUserId: actor.userId,
    details: { name: removed.name },
  });
}

/**
 * The challenge for the second step of /admin, limited to this person's passkeys. Null for an
 * person without any: they type the code.
 */
export async function passkeySignInOptions(
  actor: MfaActor,
  rp: PasskeyRelyingParty,
  { sessionId }: { sessionId: string },
  now: Date = new Date(),
): Promise<PublicKeyCredentialRequestOptionsJSON | null> {
  const passkeys = await actor.db
    .select({ id: schema.passkey.id, transports: schema.passkey.transports })
    .from(schema.passkey)
    .where(eq(schema.passkey.userId, actor.userId));
  if (passkeys.length === 0) return null;
  const options = await generateAuthenticationOptions({
    rpID: rp.id,
    allowCredentials: passkeys,
    userVerification: "preferred",
  });
  await saveChallenge(actor, sessionId, "verify", options.challenge, now);
  return options;
}

/**
 * A passkey instead of the authenticator code: one of this person's, signing this session's
 * challenge, with a counter that didn't go back. Then the session counts as verified, like
 * with the code.
 */
export async function verifyPasskey(
  actor: MfaActor,
  rp: PasskeyRelyingParty,
  input: { sessionId: string; response: AuthenticationResponseJSON },
  now: Date = new Date(),
): Promise<boolean> {
  const challenge = await takeChallenge(actor, input.sessionId, "verify", now);
  if (!challenge) return false;
  const [passkey] = await actor.db
    .select()
    .from(schema.passkey)
    .where(and(eq(schema.passkey.id, input.response.id), eq(schema.passkey.userId, actor.userId)));
  if (!passkey) return false;
  const verification = await verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: challenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.id,
    credential: {
      id: passkey.id,
      publicKey: isoBase64URL.toBuffer(passkey.publicKey),
      counter: passkey.counter,
      transports: passkey.transports,
    },
    requireUserVerification: false,
  }).catch(() => null);
  if (!verification?.verified) return false;

  // Two responses read the same counter: only one moves it.
  const [used] = await actor.db
    .update(schema.passkey)
    .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: now })
    .where(and(eq(schema.passkey.id, passkey.id), eq(schema.passkey.counter, passkey.counter)))
    .returning({ id: schema.passkey.id });
  if (!used) return false;
  await markVerified(actor.db, input.sessionId, now);
  return true;
}
