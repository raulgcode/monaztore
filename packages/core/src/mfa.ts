import { createHash, randomBytes } from "node:crypto";
import { and, type Database, eq, isNotNull, isNull, lt, or, schema, sql } from "@monaztore/db";
import { DomainError } from "./errors";
import { recordAudit } from "./platform-audit";
import { openSecret, sealSecret } from "./sealed";
import { generateTotpSecret, matchTotp, totpUri } from "./totp";

// The second sign-in step: a code from an authenticator app (or a passkey, `passkeys.ts`).
// The platform's super admins pass it to open /admin, and every store's team to open /app: a
// stolen password or email link alone opens nothing.

/**
 * /admin asks for the code again after this long, even in the same session: a stolen session
 * cookie is worth half a day at most.
 */
export const ADMIN_MFA_TTL_MS = 12 * 60 * 60 * 1000;
/**
 * A store's team passes the second step once per session (Better Auth's sessions last a week):
 * a stolen password or email link alone never opens a store.
 */
export const TEAM_MFA_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RECOVERY_CODES = 8;

/** Who passes the second step: the signed-in person, nobody else's rows. */
export interface MfaActor {
  db: Database;
  userId: string;
}

/** Where someone stands: set up the app, type today's code, or in. */
export type MfaState = "enroll" | "verify" | "verified";

const hashCode = (code: string) =>
  createHash("sha256").update(code.replace(/[\s-]/g, "").toLowerCase()).digest("hex");

/** Codes for a lost phone: `a1b2c-3d4e5`, each one works once. */
function newRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODES }, () => {
    const hex = randomBytes(5).toString("hex");
    return `${hex.slice(0, 5)}-${hex.slice(5)}`;
  });
}

/** Whether the app is set up, and whether this session passed the step within `ttlMs`. */
export async function mfaState(
  actor: MfaActor,
  sessionId: string,
  ttlMs: number,
  now: Date = new Date(),
): Promise<MfaState> {
  const [totp] = await actor.db
    .select({ confirmedAt: schema.userTotp.confirmedAt })
    .from(schema.userTotp)
    .where(eq(schema.userTotp.userId, actor.userId));
  if (!totp?.confirmedAt) return "enroll";
  const [verified] = await actor.db
    .select({ verifiedAt: schema.mfaSession.verifiedAt })
    .from(schema.mfaSession)
    .where(eq(schema.mfaSession.sessionId, sessionId));
  return verified && now.getTime() - verified.verifiedAt.getTime() < ttlMs ? "verified" : "verify";
}

/**
 * The secret to scan, kept (sealed with `key`) until the person types a first code. Opening
 * the page again shows the same one; someone who already set up the app gets an error.
 */
export async function pendingTotpEnrollment(
  actor: MfaActor,
  key: string,
  { account, issuer }: { account: string; issuer: string },
): Promise<{ secret: string; uri: string }> {
  const [current] = await actor.db
    .select()
    .from(schema.userTotp)
    .where(eq(schema.userTotp.userId, actor.userId));
  if (current?.confirmedAt) {
    throw new DomainError("totp_enrolled", "The authenticator app is already set up");
  }
  const secret = current ? openSecret(key, current.secret).toString("utf8") : generateTotpSecret();
  if (!current) {
    await actor.db
      .insert(schema.userTotp)
      .values({ userId: actor.userId, secret: sealSecret(key, secret), recoveryCodes: [] })
      .onConflictDoNothing();
  }
  return { secret, uri: totpUri(secret, account, issuer) };
}

/**
 * The first code proves the app works: the setup is kept, this session counts as verified and
 * the recovery codes come back, the only time they are shown. Null for a wrong code.
 */
export async function confirmTotpEnrollment(
  actor: MfaActor,
  key: string,
  { code, sessionId }: { code: string; sessionId: string },
  now: Date = new Date(),
): Promise<string[] | null> {
  const [pending] = await actor.db
    .select()
    .from(schema.userTotp)
    .where(and(eq(schema.userTotp.userId, actor.userId), isNull(schema.userTotp.confirmedAt)));
  if (!pending) return null;
  const step = matchTotp(openSecret(key, pending.secret).toString("utf8"), code, now);
  if (step === null) return null;

  const codes = newRecoveryCodes();
  const [confirmed] = await actor.db
    .update(schema.userTotp)
    .set({ confirmedAt: now, lastStep: step, recoveryCodes: codes.map(hashCode) })
    .where(and(eq(schema.userTotp.userId, actor.userId), isNull(schema.userTotp.confirmedAt)))
    .returning({ userId: schema.userTotp.userId });
  if (!confirmed) return null;
  await markVerified(actor.db, sessionId, now);
  await recordAudit(actor.db, {
    actorUserId: actor.userId,
    action: "mfa_enrolled",
    targetUserId: actor.userId,
  });
  return codes;
}

/**
 * Today's code from the app, or one of the recovery codes. A code works once: the step it
 * belongs to is kept, and a recovery code is crossed out.
 */
export async function verifyMfaCode(
  actor: MfaActor,
  key: string,
  { code, sessionId }: { code: string; sessionId: string },
  now: Date = new Date(),
): Promise<boolean> {
  const [totp] = await actor.db
    .select()
    .from(schema.userTotp)
    .where(and(eq(schema.userTotp.userId, actor.userId), isNotNull(schema.userTotp.confirmedAt)));
  if (!totp) return false;

  const step = matchTotp(openSecret(key, totp.secret).toString("utf8"), code, now);
  const used =
    step !== null
      ? await actor.db
          .update(schema.userTotp)
          .set({ lastStep: step })
          .where(
            and(
              eq(schema.userTotp.userId, actor.userId),
              or(isNull(schema.userTotp.lastStep), lt(schema.userTotp.lastStep, step)),
            ),
          )
          .returning({ userId: schema.userTotp.userId })
      : await actor.db
          .update(schema.userTotp)
          .set({
            recoveryCodes: sql`array_remove(${schema.userTotp.recoveryCodes}, ${hashCode(code)})`,
          })
          .where(
            and(
              eq(schema.userTotp.userId, actor.userId),
              sql`${hashCode(code)} = any(${schema.userTotp.recoveryCodes})`,
            ),
          )
          .returning({ userId: schema.userTotp.userId });
  if (used.length === 0) return false;
  await markVerified(actor.db, sessionId, now);
  return true;
}

/**
 * For a lost phone without recovery codes: the next sign-in sets the app up again. The
 * passkeys go too, since the lost phone may hold one. `actorUserId` is who reset it (a super
 * admin from the terminal or the panel), for the log.
 */
export async function resetMfa(
  db: Database,
  userId: string,
  actorUserId: string | null = null,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(schema.userTotp).where(eq(schema.userTotp.userId, userId));
    await tx.delete(schema.passkey).where(eq(schema.passkey.userId, userId));
    await tx
      .delete(schema.mfaSession)
      .where(
        sql`${schema.mfaSession.sessionId} in (select ${schema.session.id} from ${schema.session} where ${schema.session.userId} = ${userId})`,
      );
  });
  await recordAudit(db, { actorUserId, action: "mfa_reset", targetUserId: userId });
}

/** This session passed the second step: by code or by passkey. */
export async function markVerified(db: Database, sessionId: string, now: Date) {
  await db
    .insert(schema.mfaSession)
    .values({ sessionId, verifiedAt: now })
    .onConflictDoUpdate({ target: schema.mfaSession.sessionId, set: { verifiedAt: now } });
}
