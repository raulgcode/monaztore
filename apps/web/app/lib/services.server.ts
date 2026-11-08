import { createAuth, type RateLimitStorage } from "@monaztore/auth";
import { hitRateLimit } from "@monaztore/core";
import { createDatabase } from "@monaztore/db";
import { createMailer } from "@monaztore/email";
import { deriveSecret, getServerEnv, googleCredentials } from "@monaztore/env";

// Server-only singletons. Cached on globalThis so dev HMR doesn't open a new pool per reload.
function singleton<T>(name: string, create: () => T): T {
  const store = globalThis as unknown as Record<string, T | undefined>;
  store[name] ??= create();
  return store[name];
}

export const env = getServerEnv();

/** One key per use, from BETTER_AUTH_SECRET (see `deriveSecret`). Add one per new purpose. */
export const secrets = {
  /** Signs the app's own cookies (`createCookie({ secrets: [secrets.cookies] })`). */
  cookies: deriveSecret(env.BETTER_AUTH_SECRET, "cookies"),
};

export const database = singleton("__monaztoreDatabase", () => createDatabase(env.DATABASE_URL));
export const db = database.db;
export const mailer = singleton("__monaztoreMailer", () => createMailer(env));

/** Better Auth's rate limit, in Postgres so it holds across every machine. */
const authRateLimitStorage: RateLimitStorage = {
  async consume(key, { window, max }) {
    const result = await hitRateLimit(db, `auth:${key}`, { limit: max, windowMs: window * 1000 });
    return {
      allowed: result.allowed,
      retryAfter: result.allowed ? null : result.retryAfterSeconds,
    };
  },
};

export const auth = singleton("__monaztoreAuth", () =>
  createAuth({
    db,
    mailer,
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    methods: env.AUTH_METHODS,
    google: googleCredentials(env),
    rateLimit: env.AUTH_RATE_LIMIT,
    rateLimitStorage: authRateLimitStorage,
    clientIpHeader: env.CLIENT_IP_HEADER,
    // /dev/sign-in signs in as any user; false in every build, so production can't.
    devSignIn: import.meta.env.DEV,
  }),
);

/** How people sign in here (AUTH_METHODS), for /login and the pages that depend on it. */
export const authMethods = env.AUTH_METHODS;
