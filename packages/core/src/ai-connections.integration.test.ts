import { randomUUID } from "node:crypto";
import { aiTokenPrefixes } from "@monaztore/contracts";
import { eq, schema } from "@monaztore/db";
import { createTestDatabase, createTestUser } from "@monaztore/db/testing";
import { afterAll, describe, expect, it } from "vitest";
import {
  authenticateAiToken,
  hashOAuthToken,
  listAiConnections,
  removeAiConnection,
} from "./ai-connections";

const { db, close } = createTestDatabase();
afterAll(close);

/** What Better Auth leaves after someone allows an assistant: its client, the consent, a token. */
async function connectAssistant(
  userId: string,
  { expiresAt = new Date(Date.now() + 3_600_000), consent = true } = {},
) {
  const clientId = `client-${randomUUID()}`;
  const secret = randomUUID();
  const now = new Date();
  await db.insert(schema.oauthClient).values({
    clientId,
    name: "Claude",
    uri: "https://claude.ai",
    redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
  });
  if (consent) {
    await db.insert(schema.oauthConsent).values({
      clientId,
      userId,
      scopes: ["store", "offline_access"],
      createdAt: now,
      updatedAt: now,
    });
  }
  await db.insert(schema.oauthAccessToken).values({
    token: hashOAuthToken(secret),
    clientId,
    userId,
    scopes: ["store", "offline_access"],
    expiresAt,
    createdAt: now,
  });
  return { clientId, token: `${aiTokenPrefixes.opaqueAccessToken}${secret}` };
}

describe("an assistant's access token", () => {
  it("names the person and the assistant while it is in force", async () => {
    const userId = await createTestUser(db);
    const { clientId, token } = await connectAssistant(userId);
    await expect(authenticateAiToken(db, token)).resolves.toMatchObject({
      userId,
      clientId,
      clientName: "Claude",
      scopes: ["store", "offline_access"],
    });
  });

  it("stops working once expired, without its prefix, or with the consent gone", async () => {
    const userId = await createTestUser(db);
    const expired = await connectAssistant(userId, { expiresAt: new Date(Date.now() - 1000) });
    const noConsent = await connectAssistant(userId, { consent: false });
    const valid = await connectAssistant(userId);
    await expect(authenticateAiToken(db, expired.token)).resolves.toBeNull();
    await expect(authenticateAiToken(db, noConsent.token)).resolves.toBeNull();
    await expect(
      authenticateAiToken(db, valid.token.slice(aiTokenPrefixes.opaqueAccessToken.length)),
    ).resolves.toBeNull();
  });

  it("stops working for a banned person", async () => {
    const userId = await createTestUser(db);
    const { token } = await connectAssistant(userId);
    await db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, userId));
    await expect(authenticateAiToken(db, token)).resolves.toBeNull();
  });
});

describe("the person's assistants", () => {
  it("lists only their own and removing one stops its token at once", async () => {
    const userId = await createTestUser(db);
    const other = await createTestUser(db);
    const mine = await connectAssistant(userId);
    await connectAssistant(other);

    const listed = await listAiConnections(db, userId);
    expect(listed.map((connection) => connection.clientId)).toEqual([mine.clientId]);
    expect(listed[0]).toMatchObject({ name: "Claude", uri: "https://claude.ai" });

    await expect(removeAiConnection(db, other, mine.clientId)).resolves.toBe(false);
    await expect(removeAiConnection(db, userId, mine.clientId)).resolves.toBe(true);
    await expect(authenticateAiToken(db, mine.token)).resolves.toBeNull();
    await expect(listAiConnections(db, userId)).resolves.toEqual([]);
  });
});
