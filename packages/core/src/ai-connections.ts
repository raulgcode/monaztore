import { createHash } from "node:crypto";
import { type AiConnectionScope, aiConnectionScopes, aiTokenPrefixes } from "@monaztore/contracts";
import { and, type Database, desc, eq, gt, isNull, max, ne, or, schema } from "@monaztore/db";

/**
 * How an assistant's token is kept: its SHA-256, so a copy of the database can't call the MCP
 * server. Better Auth stores them with this function (the web passes it to `createAuth`) and the
 * API looks them up with it.
 */
export function hashOAuthToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Who is calling the MCP server: the person, through one assistant they allowed. */
export interface AiCaller {
  db: Database;
  userId: string;
  /** The assistant's OAuth client (`oauth_client.client_id`). */
  clientId: string;
  /** What the assistant called itself when it registered ("Claude", "ChatGPT"…). */
  clientName: string | null;
  scopes: AiConnectionScope[];
}

/**
 * The person behind an assistant's access token, if the token is in force: not expired, not
 * revoked, its assistant still allowed and the person not banned. Checked in Postgres, so the
 * API needs no call to the web. The store is never in the token: each tool resolves it with
 * `resolveTenant`, like `requireTenant` does in the workspace.
 */
export async function authenticateAiToken(
  db: Database,
  token: string,
  now: Date = new Date(),
): Promise<AiCaller | null> {
  if (!token.startsWith(aiTokenPrefixes.opaqueAccessToken)) return null;
  const secret = token.slice(aiTokenPrefixes.opaqueAccessToken.length);
  if (!secret) return null;
  const [found] = await db
    .select({
      userId: schema.oauthAccessToken.userId,
      clientId: schema.oauthAccessToken.clientId,
      clientName: schema.oauthClient.name,
      scopes: schema.oauthAccessToken.scopes,
    })
    .from(schema.oauthAccessToken)
    .innerJoin(
      schema.oauthClient,
      eq(schema.oauthClient.clientId, schema.oauthAccessToken.clientId),
    )
    .innerJoin(schema.user, eq(schema.user.id, schema.oauthAccessToken.userId))
    .where(
      and(
        eq(schema.oauthAccessToken.token, hashOAuthToken(secret)),
        gt(schema.oauthAccessToken.expiresAt, now),
        isNull(schema.oauthAccessToken.revoked),
        or(isNull(schema.user.banned), ne(schema.user.banned, true)),
      ),
    );
  if (!found?.userId) return null;
  // Removing the assistant in Settings deletes the consent: the token stops at once.
  const [consent] = await db
    .select({ id: schema.oauthConsent.id })
    .from(schema.oauthConsent)
    .where(
      and(
        eq(schema.oauthConsent.userId, found.userId),
        eq(schema.oauthConsent.clientId, found.clientId),
      ),
    )
    .limit(1);
  if (!consent) return null;
  return {
    db,
    userId: found.userId,
    clientId: found.clientId,
    clientName: found.clientName,
    scopes: found.scopes.filter((scope): scope is AiConnectionScope =>
      (aiConnectionScopes as readonly string[]).includes(scope),
    ),
  };
}

/** An assistant the person allowed, for Settings → AI assistants. */
export interface AiConnection {
  clientId: string;
  name: string | null;
  /** The assistant's website, as it registered it. */
  uri: string | null;
  connectedAt: Date;
  /** When it last got a token: assistants renew theirs every hour they are in use. */
  lastUsedAt: Date | null;
}

/** The assistants this person connected, newest first. They are the person's, not a store's. */
export async function listAiConnections(db: Database, userId: string): Promise<AiConnection[]> {
  const lastToken = db
    .select({
      clientId: schema.oauthAccessToken.clientId,
      lastUsedAt: max(schema.oauthAccessToken.createdAt).as("last_used_at"),
    })
    .from(schema.oauthAccessToken)
    .where(eq(schema.oauthAccessToken.userId, userId))
    .groupBy(schema.oauthAccessToken.clientId)
    .as("last_token");
  return db
    .select({
      clientId: schema.oauthConsent.clientId,
      name: schema.oauthClient.name,
      uri: schema.oauthClient.uri,
      connectedAt: schema.oauthConsent.createdAt,
      lastUsedAt: lastToken.lastUsedAt,
    })
    .from(schema.oauthConsent)
    .innerJoin(schema.oauthClient, eq(schema.oauthClient.clientId, schema.oauthConsent.clientId))
    .leftJoin(lastToken, eq(lastToken.clientId, schema.oauthConsent.clientId))
    .where(eq(schema.oauthConsent.userId, userId))
    .orderBy(desc(schema.oauthConsent.createdAt));
}

/**
 * Disconnects an assistant: its consent and every token it holds for this person go, so its
 * next call to the MCP server gets a 401 and it has to ask again. Returns whether there was one.
 */
export async function removeAiConnection(
  db: Database,
  userId: string,
  clientId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const ofThisPerson = <
      T extends
        | typeof schema.oauthAccessToken
        | typeof schema.oauthRefreshToken
        | typeof schema.oauthConsent,
    >(
      table: T,
    ) => and(eq(table.userId, userId), eq(table.clientId, clientId));
    // Access tokens first: they point at the refresh tokens.
    await tx.delete(schema.oauthAccessToken).where(ofThisPerson(schema.oauthAccessToken));
    await tx.delete(schema.oauthRefreshToken).where(ofThisPerson(schema.oauthRefreshToken));
    const removed = await tx
      .delete(schema.oauthConsent)
      .where(ofThisPerson(schema.oauthConsent))
      .returning({ id: schema.oauthConsent.id });
    return removed.length > 0;
  });
}
