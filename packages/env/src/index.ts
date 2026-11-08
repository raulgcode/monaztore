import { hkdfSync } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

/** Empty values in `.env` (`KEY=`) count as unset. */
const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

/**
 * The ways people can sign in. `pnpm run setup` asks which ones the project uses and writes them
 * to AUTH_METHODS; /login only shows those.
 */
export const authMethods = ["magic-link", "password", "google"] as const;
export type AuthMethod = (typeof authMethods)[number];

/** `"magic-link, google"` → `["magic-link", "google"]`, in the order of `authMethods`. */
export const authMethodsSchema = z
  .string()
  .default("magic-link")
  .transform((value, ctx) => {
    const picked = value
      .split(",")
      .map((method) => method.trim())
      .filter(Boolean);
    const unknown = picked.filter((method) => !(authMethods as readonly string[]).includes(method));
    if (unknown.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: `Unknown sign-in method: ${unknown.join(", ")} (use ${authMethods.join(", ")})`,
      });
      return z.NEVER;
    }
    if (picked.length === 0) {
      ctx.addIssue({ code: "custom", message: "Pick at least one sign-in method" });
      return z.NEVER;
    }
    return authMethods.filter((method) => picked.includes(method));
  });

export const databaseEnvSchema = z.object({
  DATABASE_URL: z.url(),
});

export const emailEnvSchema = z.object({
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: booleanString,
  EMAIL_FROM: z.string().min(3),
});

/**
 * Where the store's files (product photos) live: a private Cloudflare R2 bucket with its four
 * values, or a folder on disk without them (FILES_DIR, `.data/files` by default).
 */
export const filesEnvSchema = z.object({
  R2_ACCOUNT_ID: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  R2_BUCKET: optionalString,
  FILES_DIR: optionalString,
});

/** The value in `.env.example`: fine on a laptop, never on a public server. */
export const EXAMPLE_AUTH_SECRET = "change-me-to-a-long-random-string-of-32-chars";

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    // The web app: pages, the sign-in links in emails, Google's callback.
    APP_URL: z.url(),
    API_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
    AUTH_METHODS: authMethodsSchema,
    // Only the e2e server turns it off: every test signs in from the same IP.
    AUTH_RATE_LIMIT: z
      .enum(["on", "off"])
      .default("on")
      .transform((value) => value === "on"),
    // The header where the platform's proxy puts the caller's IP, for the rate limits. Fly.io
    // sets Fly-Client-IP and overwrites whatever the client sent; without it every caller
    // shares one bucket.
    CLIENT_IP_HEADER: z.string().trim().toLowerCase().default("fly-client-ip"),
    // multi: many stores, each on its own domain, and the platform's landing on APP_URL.
    // single: a standalone store, the only one of this instance, on every host.
    STORE_MODE: z.enum(["multi", "single"]).default("multi"),
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    // Costa Rica's electronic invoicing: the ID of whoever runs this instance, registered with
    // Hacienda as the software provider. Empty, each store is its own provider.
    HACIENDA_PROVIDER_ID: optionalString,
    ...databaseEnvSchema.shape,
    ...emailEnvSchema.shape,
    ...filesEnvSchema.shape,
  })
  .superRefine((env, ctx) => {
    // A production build on localhost (e2e, Lighthouse) may keep it; a real host may not.
    const { hostname } = new URL(env.APP_URL);
    const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
    if (!isLocal && env.BETTER_AUTH_SECRET === EXAMPLE_AUTH_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_SECRET"],
        message: "Use a secret of your own in production (openssl rand -base64 32)",
      });
    }
    if (env.AUTH_METHODS.includes("google") && !googleCredentials(env)) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_METHODS"],
        message: "google needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see .env.example)",
      });
    }
  });

export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;
export type EmailEnv = z.infer<typeof emailEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type FilesEnv = z.infer<typeof filesEnvSchema>;

export interface R2Credentials {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/** The R2 bucket and its token, or undefined when any value is missing (files go to disk). */
export function r2Credentials(
  env: Pick<FilesEnv, "R2_ACCOUNT_ID" | "R2_ACCESS_KEY_ID" | "R2_SECRET_ACCESS_KEY" | "R2_BUCKET">,
): R2Credentials | undefined {
  const { R2_ACCOUNT_ID: accountId, R2_ACCESS_KEY_ID: accessKeyId } = env;
  const { R2_SECRET_ACCESS_KEY: secretAccessKey, R2_BUCKET: bucket } = env;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return undefined;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
}

/** Google OAuth credentials, or undefined when either one is missing. */
export function googleCredentials(
  env: Pick<ServerEnv, "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET">,
): GoogleCredentials | undefined {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = env;
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

/**
 * Loads the nearest `.env` walking up from `cwd`. Variables already set in the
 * real environment always win, so deployed apps (no .env file) are unaffected.
 */
export function loadDotEnv(cwd: string = process.cwd()): void {
  let dir = cwd;
  while (true) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

export function parseEnv<TSchema extends z.ZodType>(
  schema: TSchema,
  source: Record<string, string | undefined> = process.env,
): z.infer<TSchema> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return result.data;
}

let cachedServerEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (!cachedServerEnv) {
    loadDotEnv();
    cachedServerEnv = parseEnv(serverEnvSchema);
  }
  return cachedServerEnv;
}

/**
 * A key for one purpose (signing a cookie, encrypting a secret), derived from BETTER_AUTH_SECRET
 * with HKDF: a key leaked from one use tells nothing about the others.
 */
export function deriveSecret(secret: string, purpose: string): string {
  return Buffer.from(hkdfSync("sha256", secret, "monaztore", purpose, 32)).toString("base64url");
}
