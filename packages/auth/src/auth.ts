import { createHash } from "node:crypto";
import { oauthProvider } from "@better-auth/oauth-provider";
import { aiConnectionScopes, aiTokenPrefixes, mcpUrl } from "@monaztore/contracts";
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
import { admin, magicLink, organization } from "better-auth/plugins";
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

/** The platform operator's role on `user.role`: the only one that opens /admin. */
export const SUPER_ADMIN_ROLE = "admin";

/**
 * The super admin endpoints. /admin calls them with `auth.api` after its own checks (the
 * authenticator code, the internal log); over HTTP they would skip both.
 */
export const disabledAdminPaths = [
  "/admin/ban-user",
  "/admin/create-user",
  "/admin/get-user",
  "/admin/has-permission",
  "/admin/impersonate-user",
  "/admin/list-user-sessions",
  "/admin/list-users",
  "/admin/remove-user",
  "/admin/revoke-user-session",
  "/admin/revoke-user-sessions",
  "/admin/set-role",
  "/admin/set-user-password",
  "/admin/stop-impersonating",
  "/admin/unban-user",
  "/admin/update-user",
];

/**
 * The OAuth provider's management endpoints. Assistants (Claude, ChatGPT, the editors) register
 * themselves at /oauth2/register and the person sees and removes their connections in Settings →
 * AI assistants, which goes through @monaztore/core. Over HTTP these would let anyone with a
 * session create clients, resources or consents by hand.
 */
export const disabledOAuthProviderPaths = [
  "/oauth2/create-client",
  "/oauth2/get-client",
  "/oauth2/get-clients",
  "/oauth2/update-client",
  "/oauth2/delete-client",
  "/oauth2/client/rotate-secret",
  "/oauth2/get-consent",
  "/oauth2/get-consents",
  "/oauth2/update-consent",
  "/oauth2/delete-consent",
  "/admin/oauth2/create-client",
  "/admin/oauth2/update-client",
  "/admin/oauth2/resources",
  "/admin/oauth2/resources/:identifier",
  "/admin/oauth2/resources/:identifier/clients/:client_id",
];

/** The page that shows the person what the assistant asks for (apps/web). */
export const AI_CONSENT_PAGE = "/oauth/consent";

const sha256 = (token: string) => createHash("sha256").update(token).digest("hex");

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
  /**
   * The API (API_URL): its MCP server (`${apiUrl}/mcp`) is what the assistants' tokens are for.
   * The web is the authorization server. Without it, the tokens are for `${baseURL}/mcp`.
   */
  apiUrl?: string;
  /**
   * How an assistant's token is kept: `hashOAuthToken` of @monaztore/core, the function the API
   * looks tokens up with (SHA-256, so a copy of the database can't call the MCP server).
   */
  hashToken?: (token: string) => string;
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
  apiUrl = baseURL,
  hashToken = sha256,
}: CreateAuthOptions) {
  const mcpResource = mcpUrl(apiUrl);
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
    disabledPaths: [
      ...disabledOrganizationPaths,
      ...disabledAdminPaths,
      ...disabledOAuthProviderPaths,
    ],
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
      // Support sessions ("Entrar como dueño") last an hour; nobody gets the role over HTTP.
      admin({
        defaultRole: "user",
        adminRoles: [SUPER_ADMIN_ROLE],
        impersonationSessionDuration: 60 * 60,
      }),
      devSignIn(devSignInEnabled),
      // AI assistants: the person connects Claude, ChatGPT or an editor to the API's MCP server.
      oauthProvider({
        loginPage: "/login",
        consentPage: AI_CONSENT_PAGE,
        scopes: [...aiConnectionScopes],
        // Opaque tokens, checked by the API in Postgres: no signing keys to share or rotate.
        disableJwtPlugin: true,
        storeTokens: { hash: hashToken },
        prefix: { ...aiTokenPrefixes },
        // Assistants register themselves the first time (RFC 7591), with no account of theirs
        // here: what protects the store is the sign-in, the second step and the consent.
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        // Editors (Cursor, VS Code) listen on http://127.0.0.1 and often leave the type out.
        clientRegistrationDefaultApplicationType: "infer",
        resources: [{ identifier: mcpResource, name: `${project.name} MCP` }],
        clientRegistrationDefaultResources: [mcpResource],
        // Someone reconnects after 90 days without using it, not every month.
        refreshTokenExpiresIn: 90 * 24 * 60 * 60,
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;
