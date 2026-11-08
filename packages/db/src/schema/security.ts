import {
  bigint,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { session, user } from "./auth";

// Platform protection, not workspace data: no organization_id here.

/**
 * How many times a key (an IP, an email, an API key) asked for something in the current
 * window. Shared by every server, so the limit holds however many machines are running.
 */
export const rateLimit = pgTable(
  "rate_limit",
  {
    key: text().primaryKey(),
    windowStart: timestamp({ withTimezone: true }).notNull(),
    count: integer().notNull(),
  },
  (table) => [index("rate_limit_window_idx").on(table.windowStart)],
);

/**
 * A person's authenticator app (TOTP): the secret sealed with the `mfa` key, the SHA-256 of
 * the recovery codes still unused, and the last 30-second step that worked, so a code never
 * works twice. `confirmedAt` is empty until the first code proves the app was set up.
 */
export const userTotp = pgTable("user_totp", {
  userId: uuid()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  secret: text().notNull(),
  recoveryCodes: text().array().notNull(),
  lastStep: bigint({ mode: "number" }),
  confirmedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

/** The sessions that passed the second step (a code or a passkey), and when. */
export const mfaSession = pgTable("mfa_session", {
  sessionId: uuid()
    .primaryKey()
    .references(() => session.id, { onDelete: "cascade" }),
  verifiedAt: timestamp({ withTimezone: true }).notNull(),
});

/**
 * A passkey (fingerprint, face, the phone or a security key): a faster second step than the
 * code. `id` is the credential id and `publicKey` its COSE key, both base64url; `counter`
 * catches a cloned key when it goes back.
 */
export const passkey = pgTable(
  "passkey",
  {
    id: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    publicKey: text().notNull(),
    counter: bigint({ mode: "number" }).notNull().default(0),
    transports: text().array().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp({ withTimezone: true }),
  },
  (table) => [index("passkey_user_idx").on(table.userId)],
);

/** The challenge a session's browser has to sign, once, within a few minutes. */
export const passkeyChallenge = pgTable(
  "passkey_challenge",
  {
    sessionId: uuid()
      .notNull()
      .references(() => session.id, { onDelete: "cascade" }),
    purpose: text({ enum: ["register", "verify"] }).notNull(),
    challenge: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.purpose] })],
);
