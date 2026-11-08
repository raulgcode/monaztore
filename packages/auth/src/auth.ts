import { and, asc, type Database, desc, eq, isNotNull, schema, sql } from "@monaztore/db";
import {
  AccountEmail,
  accountEmailSubject,
  MagicLinkEmail,
  type Mailer,
  magicLinkSubject,
} from "@monaztore/email";
import type { AuthMethod } from "@monaztore/env";
import { project } from "@monaztore/env/project";
import { defaultLocale, parseLocale } from "@monaztore/i18n";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink, organization } from "better-auth/plugins";
import { createElement } from "react";
import { devSignIn } from "./dev-sign-in";

/**
 * The workspace a new session opens with: the one the user had open in their latest session,
 * if they are still a member, otherwise the first workspace they joined.
 */
export async function defaultOrganizationId(db: Database, userId: string) {
  const [lastUsed] = await db
    .select({ organizationId: schema.member.organizationId })
    .from(schema.session)
    .innerJoin(
      schema.member,
      and(
        eq(schema.member.userId, schema.session.userId),
        // session.active_organization_id is text (Better Auth's schema); organization ids are uuid.
        eq(sql`${schema.member.organizationId}::text`, schema.session.activeOrganizationId),
      ),
    )
    .where(and(eq(schema.session.userId, userId), isNotNull(schema.session.activeOrganizationId)))
    .orderBy(desc(schema.session.createdAt))
    .limit(1);
  if (lastUsed) return lastUsed.organizationId;

  const [membership] = await db
    .select({ organizationId: schema.member.organizationId })
    .from(schema.member)
    .where(eq(schema.member.userId, userId))
    .orderBy(asc(schema.member.createdAt))
    .limit(1);
  return membership?.organizationId;
}

export type RateLimitStorage = NonNullable<
  NonNullable<BetterAuthOptions["rateLimit"]>["customStorage"]
>;

/**
 * Members and invitations go through @monaztore/core (with its own checks), so Better Auth's own
 * endpoints for them are off over HTTP: without this, any member could invite, promote or remove
 * people by calling them directly. The server keeps using `auth.api` after its own checks.
 */
export const disabledOrganizationPaths = [
  "/organization/invite-member",
  "/organization/accept-invitation",
  "/organization/reject-invitation",
  "/organization/cancel-invitation",
  "/organization/get-invitation",
  "/organization/list-invitations",
  "/organization/list-user-invitations",
  "/organization/add-member",
  "/organization/remove-member",
  "/organization/update-member-role",
  "/organization/leave",
  "/organization/update",
  "/organization/delete",
  "/organization/list-members",
  "/organization/get-full-organization",
  // Workspaces are created by the onboarding (`auth.api` on the server), which picks the slug
  // with its random suffix; over HTTP anyone could take "settings" or a brand's name.
  "/organization/create",
  "/organization/check-slug",
];

export interface CreateAuthOptions {
  db: Database;
  mailer: Mailer;
  baseURL: string;
  secret: string;
  /** How people sign in (AUTH_METHODS): only these are switched on. */
  methods: readonly AuthMethod[];
  trustedOrigins?: string[];
  /** Needed when `methods` has "google". */
  google?: { clientId: string; clientSecret: string };
  /** Better Auth's per-IP rate limit. Defaults to on; the e2e server disables it. */
  rateLimit?: boolean;
  /**
   * Where the rate limit counts, shared by every server (`hitRateLimit` of @monaztore/core);
   * in memory without it, which only holds on a single machine.
   */
  rateLimitStorage?: RateLimitStorage;
  /** The header with the caller's IP, set by the platform's proxy (Fly-Client-IP on Fly.io). */
  clientIpHeader?: string;
  /** Local development only: enables `auth.api.devSignIn` (see dev-sign-in.ts). */
  devSignIn?: boolean;
}

export function createAuth({
  db,
  mailer,
  baseURL,
  secret,
  methods,
  trustedOrigins = [],
  google,
  rateLimit = true,
  rateLimitStorage,
  clientIpHeader,
  devSignIn: devSignInEnabled = false,
}: CreateAuthOptions) {
  const password = methods.includes("password");
  if (methods.includes("google") && !google) {
    throw new Error("Google sign-in needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET");
  }

  const sendAccountEmail = async (
    kind: "verify" | "reset",
    user: { email: string; name: string; locale?: unknown },
    url: string,
  ) => {
    const locale = parseLocale(user.locale) ?? defaultLocale;
    await mailer.send({
      to: user.email,
      subject: accountEmailSubject(kind, locale),
      react: createElement(AccountEmail, { kind, locale, name: user.name, url }),
    });
  };

  return betterAuth({
    appName: project.name,
    baseURL,
    secret,
    trustedOrigins: [baseURL, ...trustedOrigins],
    rateLimit: { enabled: rateLimit, customStorage: rateLimitStorage },
    disabledPaths: disabledOrganizationPaths,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    user: {
      additionalFields: {
        // The language the person picked, for any device and for their emails. Written by the
        // web's /locale action and at sign-up, from the page's language.
        locale: { type: "string", required: false, input: true },
      },
    },
    // An email proved by Google, a magic link or a confirmation joins the same account.
    account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
    socialProviders:
      methods.includes("google") && google
        ? { google: { ...google, prompt: "select_account" } }
        : {},
    emailAndPassword: {
      enabled: password,
      // No session before the email is proved: nobody signs up with someone else's address.
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, url }) {
        await sendAccountEmail("reset", user, url);
      },
    },
    emailVerification: password
      ? {
          sendOnSignUp: true,
          sendOnSignIn: true,
          autoSignInAfterVerification: true,
          async sendVerificationEmail({ user, url }) {
            await sendAccountEmail("verify", user, url);
          },
        }
      : undefined,
    databaseHooks: {
      session: {
        create: {
          // A new sign-in reopens the workspace used last; without it they'd land in onboarding.
          async before(session) {
            if (session.activeOrganizationId) return;
            const activeOrganizationId = await defaultOrganizationId(db, session.userId);
            if (!activeOrganizationId) return;
            return { data: { ...session, activeOrganizationId } };
          },
        },
      },
    },
    advanced: {
      database: { generateId: "uuid" },
      ipAddress: clientIpHeader ? { ipAddressHeaders: [clientIpHeader] } : undefined,
    },
    plugins: [
      magicLink({
        // The plugin always answers on the server; with the method off, the web never calls it.
        disableSignUp: !methods.includes("magic-link"),
        expiresIn: 60 * 5,
        // Only the hash is kept: a copy of the database can't sign anyone in.
        storeToken: "hashed",
        // The sign-in form sends the page's language as metadata, so the email matches it.
        async sendMagicLink({ email, url, metadata }) {
          const locale = parseLocale(metadata?.locale) ?? defaultLocale;
          await mailer.send({
            to: email,
            subject: magicLinkSubject(locale),
            react: createElement(MagicLinkEmail, { url, locale }),
          });
        },
      }),
      organization({ creatorRole: "owner" }),
      devSignIn(devSignInEnabled),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;
