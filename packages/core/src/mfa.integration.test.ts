import { randomUUID } from "node:crypto";
import { eq, schema } from "@monaztore/db";
import { createTestDatabase } from "@monaztore/db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ADMIN_MFA_TTL_MS,
  confirmTotpEnrollment,
  mfaState,
  pendingTotpEnrollment,
  resetMfa,
  verifyMfaCode,
} from "./mfa";
import {
  type PlatformAdminContext,
  platformAdminContext,
  promoteSuperAdmins,
} from "./platform-admin";
import { totpCode, totpStep } from "./totp";

const connection = createTestDatabase();
const db = connection.db;
afterAll(() => connection.close());

const key = Buffer.alloc(32, 3).toString("base64url");
const now = new Date("2026-10-23T12:00:00Z");
const later = (ms: number) => new Date(now.getTime() + ms);

let admin: PlatformAdminContext;
let sessionId: string;

async function newSession(userId: string): Promise<string> {
  const [row] = await db
    .insert(schema.session)
    .values({
      userId,
      token: randomUUID(),
      expiresAt: later(7 * 24 * 60 * 60 * 1000),
      updatedAt: now,
    })
    .returning({ id: schema.session.id });
  if (!row) throw new Error("No session");
  return row.id;
}

beforeEach(async () => {
  const [userId] = await promoteSuperAdmins(db, [`admin-${randomUUID()}@test.monaztore.com`]);
  const ctx = userId ? await platformAdminContext(db, userId) : undefined;
  if (!ctx) throw new Error("No admin context");
  admin = ctx;
  sessionId = await newSession(admin.userId);
});

/** Sets the app up with the code of `at` and returns the secret and the recovery codes. */
async function enroll(at = now) {
  const { secret } = await pendingTotpEnrollment(admin, key, {
    account: "ana@tienda.test",
    issuer: "Monazhop",
  });
  const codes = await confirmTotpEnrollment(
    admin,
    key,
    { code: totpCode(secret, totpStep(at)), sessionId },
    at,
  );
  if (!codes) throw new Error("Enrollment failed");
  return { secret, codes };
}

describe("setting up the authenticator app", () => {
  it("asks a new super admin to set it up", async () => {
    expect(await mfaState(admin, sessionId, ADMIN_MFA_TTL_MS, now)).toBe("enroll");
  });

  it("shows the same secret until the first code, and keeps it encrypted", async () => {
    const first = await pendingTotpEnrollment(admin, key, {
      account: "ana@tienda.test",
      issuer: "Monazhop",
    });
    const again = await pendingTotpEnrollment(admin, key, {
      account: "ana@tienda.test",
      issuer: "Monazhop",
    });

    expect(again.secret).toBe(first.secret);
    expect(first.uri).toContain(`secret=${first.secret}`);
    const [row] = await db
      .select()
      .from(schema.userTotp)
      .where(eq(schema.userTotp.userId, admin.userId));
    expect(row?.secret).not.toContain(first.secret);
  });

  it("refuses a wrong first code and stays to set up", async () => {
    await pendingTotpEnrollment(admin, key, { account: "ana@tienda.test", issuer: "Monazhop" });

    expect(await confirmTotpEnrollment(admin, key, { code: "000000", sessionId }, now)).toBeNull();
    expect(await mfaState(admin, sessionId, ADMIN_MFA_TTL_MS, now)).toBe("enroll");
  });

  it("with the right code, lets this session in and gives 8 one-time recovery codes", async () => {
    const { codes } = await enroll();

    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    expect(await mfaState(admin, sessionId, ADMIN_MFA_TTL_MS, now)).toBe("verified");
    await expect(
      pendingTotpEnrollment(admin, key, { account: "ana@tienda.test", issuer: "Monazhop" }),
    ).rejects.toThrow(/already set up/);
  });
});

describe("typing the code on each new session", () => {
  it("asks again in another session and after 12 hours", async () => {
    await enroll();
    const other = await newSession(admin.userId);

    expect(await mfaState(admin, other, ADMIN_MFA_TTL_MS, now)).toBe("verify");
    expect(await mfaState(admin, sessionId, ADMIN_MFA_TTL_MS, later(ADMIN_MFA_TTL_MS))).toBe(
      "verify",
    );
  });

  it("lets the session in with the app's current code", async () => {
    const { secret } = await enroll();
    const other = await newSession(admin.userId);
    const at = later(60_000);

    const ok = await verifyMfaCode(
      admin,
      key,
      { code: totpCode(secret, totpStep(at)), sessionId: other },
      at,
    );

    expect(ok).toBe(true);
    expect(await mfaState(admin, other, ADMIN_MFA_TTL_MS, at)).toBe("verified");
  });

  it("never takes the same code twice, not even in another session", async () => {
    const { secret } = await enroll();
    const at = later(60_000);
    const code = totpCode(secret, totpStep(at));
    const [first, second] = [await newSession(admin.userId), await newSession(admin.userId)];

    expect(await verifyMfaCode(admin, key, { code, sessionId: first }, at)).toBe(true);
    expect(await verifyMfaCode(admin, key, { code, sessionId: second }, at)).toBe(false);
  });

  it("refuses a wrong code", async () => {
    await enroll();
    const other = await newSession(admin.userId);

    expect(await verifyMfaCode(admin, key, { code: "123456", sessionId: other }, now)).toBe(false);
    expect(await mfaState(admin, other, ADMIN_MFA_TTL_MS, now)).toBe("verify");
  });

  it("takes a recovery code once", async () => {
    const { codes } = await enroll();
    const recovery = codes[0] ?? "";
    const [first, second] = [await newSession(admin.userId), await newSession(admin.userId)];

    expect(
      await verifyMfaCode(admin, key, { code: recovery.toUpperCase(), sessionId: first }, now),
    ).toBe(true);
    expect(await verifyMfaCode(admin, key, { code: recovery, sessionId: second }, now)).toBe(false);
  });

  it("starts over after a reset (a lost phone)", async () => {
    await enroll();

    await resetMfa(db, admin.userId);

    expect(await mfaState(admin, sessionId, ADMIN_MFA_TTL_MS, now)).toBe("enroll");
  });
});
