import { createHash, createSign, generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { and, eq, schema } from "@monaztore/db";
import { createTestDatabase } from "@monaztore/db/testing";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL, isoCBOR } from "@simplewebauthn/server/helpers";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_MFA_TTL_MS, mfaState, resetMfa } from "./mfa";
import {
  addPasskey,
  listPasskeys,
  PASSKEY_CHALLENGE_TTL_MS,
  PASSKEYS_MAX,
  passkeyRegistrationOptions,
  passkeySignInOptions,
  removePasskey,
  verifyPasskey,
} from "./passkeys";
import {
  type PlatformAdminContext,
  platformAdminContext,
  promoteSuperAdmins,
} from "./platform-admin";

const connection = createTestDatabase();
const db = connection.db;
afterAll(() => connection.close());

const rp = { id: "app.monazhop.test", origin: "https://app.monazhop.test", name: "Monazhop" };
const now = new Date("2026-10-29T12:00:00Z");
const later = (ms: number) => new Date(now.getTime() + ms);

let admin: PlatformAdminContext;
let sessionId: string;

async function newSession(userId: string): Promise<string> {
  const [row] = await db
    .insert(schema.session)
    .values({ userId, token: randomUUID(), expiresAt: later(86_400_000), updatedAt: now })
    .returning({ id: schema.session.id });
  if (!row) throw new Error("No session");
  return row.id;
}

/** A super admin whose authenticator app is set up: /admin asks this session for the code. */
async function newAdmin(): Promise<PlatformAdminContext> {
  const [userId] = await promoteSuperAdmins(db, [`admin-${randomUUID()}@test.monaztore.com`]);
  const ctx = userId ? await platformAdminContext(db, userId) : undefined;
  if (!ctx) throw new Error("No admin context");
  await db
    .insert(schema.userTotp)
    .values({ userId: ctx.userId, secret: "x", recoveryCodes: [], confirmedAt: now });
  return ctx;
}

beforeEach(async () => {
  admin = await newAdmin();
  sessionId = await newSession(admin.userId);
});

const sha256 = (data: Uint8Array | string) =>
  new Uint8Array(createHash("sha256").update(data).digest());
const concat = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((part) => [...part]));
const uint32 = (n: number) =>
  new Uint8Array([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const json = (value: unknown) => isoBase64URL.fromUTF8String(JSON.stringify(value));

/**
 * A security key in software, as a browser would hand it over: a P-256 key that signs what
 * it's given for whatever host and origin the test says.
 */
function softAuthenticator() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const coseKey = isoCBOR.encode(
    new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, isoBase64URL.toBuffer(jwk.x ?? "")],
      [-3, isoBase64URL.toBuffer(jwk.y ?? "")],
    ]),
  );
  const rawId = new Uint8Array(randomBytes(16));
  const id = isoBase64URL.fromBuffer(rawId);
  let counter = 0;

  return {
    id,
    create(
      options: PublicKeyCredentialCreationOptionsJSON,
      { rpId = rp.id, origin = rp.origin } = {},
    ): RegistrationResponseJSON {
      const clientDataJSON = json({
        type: "webauthn.create",
        challenge: options.challenge,
        origin,
      });
      const authData = concat(
        sha256(rpId),
        new Uint8Array([0x45]),
        uint32(counter),
        new Uint8Array(16),
        new Uint8Array([0, rawId.length]),
        rawId,
        coseKey,
      );
      const attestationObject = isoCBOR.encode(
        new Map<string, string | Uint8Array | Map<number, number>>([
          ["fmt", "none"],
          ["attStmt", new Map<number, number>()],
          ["authData", authData],
        ]),
      );
      return {
        id,
        rawId: id,
        type: "public-key",
        clientExtensionResults: {},
        response: {
          clientDataJSON,
          attestationObject: isoBase64URL.fromBuffer(attestationObject),
          transports: ["internal"],
        },
      };
    },
    get(
      options: PublicKeyCredentialRequestOptionsJSON,
      { origin = rp.origin, nextCounter = counter + 1 } = {},
    ): AuthenticationResponseJSON {
      counter = nextCounter;
      const clientDataJSON = json({ type: "webauthn.get", challenge: options.challenge, origin });
      const authenticatorData = concat(sha256(rp.id), new Uint8Array([0x05]), uint32(counter));
      const signer = createSign("sha256");
      signer.update(concat(authenticatorData, sha256(isoBase64URL.toBuffer(clientDataJSON))));
      return {
        id,
        rawId: id,
        type: "public-key",
        clientExtensionResults: {},
        response: {
          clientDataJSON,
          authenticatorData: isoBase64URL.fromBuffer(authenticatorData),
          signature: isoBase64URL.fromBuffer(new Uint8Array(signer.sign(privateKey))),
        },
      };
    },
  };
}

type SoftAuthenticator = ReturnType<typeof softAuthenticator>;

async function registerKey(key: SoftAuthenticator, name = "iPhone de Ana") {
  const options = await passkeyRegistrationOptions(
    admin,
    rp,
    { sessionId, userName: "ana@tienda.test" },
    now,
  );
  return addPasskey(admin, rp, { sessionId, name, response: key.create(options) }, now);
}

async function signIn(key: SoftAuthenticator, session: string, at = later(60_000), options = {}) {
  const challenge = await passkeySignInOptions(admin, rp, { sessionId: session }, at);
  if (!challenge) throw new Error("No passkeys");
  return verifyPasskey(
    admin,
    rp,
    { sessionId: session, response: key.get(challenge, options) },
    at,
  );
}

describe("adding a passkey", () => {
  it("keeps the passkey the browser made for our host and logs it", async () => {
    const key = softAuthenticator();

    const passkey = await registerKey(key);

    expect(passkey).toMatchObject({ id: key.id, name: "iPhone de Ana", lastUsedAt: null });
    expect(await listPasskeys(admin)).toEqual([passkey]);
    const [entry] = await db
      .select()
      .from(schema.platformAuditLog)
      .where(
        and(
          eq(schema.platformAuditLog.actorUserId, admin.userId),
          eq(schema.platformAuditLog.action, "passkey_added"),
        ),
      );
    expect(entry?.details).toEqual({ name: "iPhone de Ana" });
  });

  it("refuses a passkey made for another site", async () => {
    const options = await passkeyRegistrationOptions(
      admin,
      rp,
      { sessionId, userName: "ana@tienda.test" },
      now,
    );
    const response = softAuthenticator().create(options, {
      rpId: "evil.test",
      origin: "https://evil.test",
    });

    expect(await addPasskey(admin, rp, { sessionId, name: "x", response }, now)).toBeNull();
    expect(await listPasskeys(admin)).toEqual([]);
  });

  it("refuses a response to an expired challenge, and each challenge works once", async () => {
    const key = softAuthenticator();
    const options = await passkeyRegistrationOptions(
      admin,
      rp,
      { sessionId, userName: "ana@tienda.test" },
      now,
    );
    const response = key.create(options);
    const tooLate = later(PASSKEY_CHALLENGE_TTL_MS + 1);

    expect(await addPasskey(admin, rp, { sessionId, name: "x", response }, tooLate)).toBe(null);
    expect(await addPasskey(admin, rp, { sessionId, name: "x", response }, now)).toBeNull();
  });

  it("doesn't offer the browser a passkey it already has", async () => {
    const key = softAuthenticator();
    await registerKey(key);

    const options = await passkeyRegistrationOptions(
      admin,
      rp,
      { sessionId, userName: "ana@tienda.test" },
      now,
    );

    expect(options.excludeCredentials?.map((credential) => credential.id)).toEqual([key.id]);
    expect(options.rp).toEqual({ id: rp.id, name: rp.name });
  });

  it(`stops at ${PASSKEYS_MAX} passkeys`, async () => {
    for (let i = 0; i < PASSKEYS_MAX; i++) await registerKey(softAuthenticator());

    await expect(registerKey(softAuthenticator())).rejects.toThrow(/Too many passkeys/);
  });
});

describe("entering /admin with a passkey", () => {
  it("has no challenge for an admin without passkeys: they type the code", async () => {
    expect(await passkeySignInOptions(admin, rp, { sessionId }, now)).toBeNull();
  });

  it("lets a new session in with the admin's passkey, and remembers when it was used", async () => {
    const key = softAuthenticator();
    await registerKey(key);
    const other = await newSession(admin.userId);
    const at = later(60_000);
    expect(await mfaState(admin, other, ADMIN_MFA_TTL_MS, at)).toBe("verify");

    expect(await signIn(key, other, at)).toBe(true);

    expect(await mfaState(admin, other, ADMIN_MFA_TTL_MS, at)).toBe("verified");
    expect((await listPasskeys(admin))[0]?.lastUsedAt).toEqual(at);
  });

  it("offers only this admin's passkeys and refuses another admin's", async () => {
    const mine = softAuthenticator();
    await registerKey(mine);
    const someoneElse = await newAdmin();
    const theirs = softAuthenticator();
    const theirSession = await newSession(someoneElse.userId);
    const options = await passkeyRegistrationOptions(
      someoneElse,
      rp,
      { sessionId: theirSession, userName: "luis@tienda.test" },
      now,
    );
    await addPasskey(
      someoneElse,
      rp,
      { sessionId: theirSession, name: "Llave", response: theirs.create(options) },
      now,
    );
    const other = await newSession(admin.userId);

    const challenge = await passkeySignInOptions(admin, rp, { sessionId: other }, now);
    expect(challenge?.allowCredentials?.map((credential) => credential.id)).toEqual([mine.id]);
    expect(await signIn(theirs, other)).toBe(false);
    expect(await mfaState(admin, other, ADMIN_MFA_TTL_MS, later(60_000))).toBe("verify");
  });

  it("refuses a signature for another origin", async () => {
    const key = softAuthenticator();
    await registerKey(key);
    const other = await newSession(admin.userId);

    expect(await signIn(key, other, later(60_000), { origin: "https://evil.test" })).toBe(false);
  });

  it("refuses a cloned key whose counter goes back", async () => {
    const key = softAuthenticator();
    await registerKey(key);
    expect(
      await signIn(key, await newSession(admin.userId), later(60_000), { nextCounter: 5 }),
    ).toBe(true);

    expect(
      await signIn(key, await newSession(admin.userId), later(120_000), { nextCounter: 3 }),
    ).toBe(false);
  });

  it("refuses the same signed challenge twice", async () => {
    const key = softAuthenticator();
    await registerKey(key);
    const other = await newSession(admin.userId);
    const at = later(60_000);
    const challenge = await passkeySignInOptions(admin, rp, { sessionId: other }, at);
    if (!challenge) throw new Error("No passkeys");
    const response = key.get(challenge);

    expect(await verifyPasskey(admin, rp, { sessionId: other, response }, at)).toBe(true);
    expect(await verifyPasskey(admin, rp, { sessionId: other, response }, at)).toBe(false);
  });
});

describe("removing passkeys", () => {
  it("removes only the admin's own passkey, and it stops working", async () => {
    const key = softAuthenticator();
    await registerKey(key);
    const someoneElse = await newAdmin();

    await removePasskey(someoneElse, key.id);
    expect(await listPasskeys(admin)).toHaveLength(1);

    await removePasskey(admin, key.id);
    expect(await listPasskeys(admin)).toEqual([]);
    expect(await passkeySignInOptions(admin, rp, { sessionId }, now)).toBeNull();
  });

  it("forgets them with the authenticator app when an admin lost their phone", async () => {
    await registerKey(softAuthenticator());

    await resetMfa(db, admin.userId);

    expect(await listPasskeys(admin)).toEqual([]);
  });
});
