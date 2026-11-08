import { eq, schema } from "@monaztore/db";
import { createTestDatabase, createTestTenant, createTestUser } from "@monaztore/db/testing";
import type { SendEmailInput } from "@monaztore/email";
import type { AuthMethod } from "@monaztore/env";
import { afterAll, describe, expect, it } from "vitest";
import { createAuth } from "./auth";

const connection = createTestDatabase();
afterAll(() => connection.close());

const baseURL = "http://localhost:5173";
const google = { clientId: "client-id", clientSecret: "client-secret" };

function authWith(methods: AuthMethod[] = ["magic-link"], sent: SendEmailInput[] = []) {
  return createAuth({
    db: connection.db,
    mailer: { send: async (email) => void sent.push(email) },
    baseURL,
    secret: "x".repeat(32),
    methods,
    google: methods.includes("google") ? google : undefined,
    rateLimit: false,
  });
}

const uniqueEmail = () => `user-${crypto.randomUUID().slice(0, 8)}@test.monaztore.com`;

describe("Google", () => {
  it("sends to Google with our callback and keeps the state", async () => {
    const auth = authWith(["google"]);

    const { headers, response } = await auth.api.signInSocial({
      body: { provider: "google", callbackURL: "/app", disableRedirect: true },
      returnHeaders: true,
    });

    const url = new URL(response.url ?? "");
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(`${baseURL}/api/auth/callback/google`);
    expect(url.searchParams.get("prompt")).toBe("select_account");
    expect(headers.get("set-cookie")).toContain("state");
  });

  it("isn't offered when it isn't one of the methods", async () => {
    await expect(
      authWith(["magic-link"]).api.signInSocial({
        body: { provider: "google", callbackURL: "/app" },
      }),
    ).rejects.toThrow();
  });

  it("doesn't start without credentials", () => {
    expect(() =>
      createAuth({
        db: connection.db,
        mailer: { send: async () => {} },
        baseURL,
        secret: "x".repeat(32),
        methods: ["google"],
      }),
    ).toThrow(/GOOGLE_CLIENT_ID/);
  });
});

describe("email and password", () => {
  it("signing up sends the confirmation email and opens no session", async () => {
    const sent: SendEmailInput[] = [];
    const auth = authWith(["password"], sent);
    const email = uniqueEmail();

    const result = await auth.api.signUpEmail({
      body: { name: "Ana", email, password: "a-long-password", locale: "en" },
    });

    expect(result.token).toBeNull();
    expect(sent.map((message) => [message.to, message.subject])).toEqual([
      [email, "Confirm your email"],
    ]);
  });

  it("doesn't let the password in before the email is confirmed", async () => {
    const auth = authWith(["password"]);
    const email = uniqueEmail();
    await auth.api.signUpEmail({ body: { name: "Ana", email, password: "a-long-password" } });

    await expect(
      auth.api.signInEmail({ body: { email, password: "a-long-password" } }),
    ).rejects.toMatchObject({ status: "FORBIDDEN" });
  });

  it("when off, no account can be created with a password", async () => {
    await expect(
      authWith(["magic-link"]).api.signUpEmail({
        body: { name: "Ana", email: uniqueEmail(), password: "a-long-password" },
      }),
    ).rejects.toThrow();
  });
});

describe("magic link", () => {
  it("sends the link in the page's language", async () => {
    const sent: SendEmailInput[] = [];
    const email = uniqueEmail();

    await authWith(["magic-link"], sent).api.signInMagicLink({
      body: { email, metadata: { locale: "es" } },
      headers: new Headers(),
    });

    expect(sent.map((message) => [message.to, message.subject])).toEqual([
      [email, "Tu enlace para entrar"],
    ]);
  });
});

async function activeOrganizationOf(sessionId: string) {
  const [row] = await connection.db
    .select({ id: schema.session.activeOrganizationId })
    .from(schema.session)
    .where(eq(schema.session.id, sessionId));
  return row?.id;
}

describe("active workspace on sign-in", () => {
  it("opens the person's workspace on every new session", async () => {
    const tenant = await createTestTenant(connection.db);

    const internal = (await authWith().$context).internalAdapter;
    const session = await internal.createSession(tenant.userId);

    expect(await activeOrganizationOf(session.id)).toBe(tenant.organizationId);
  });

  it("leaves the session without a workspace until they create one", async () => {
    const userId = await createTestUser(connection.db);

    const session = await (await authWith().$context).internalAdapter.createSession(userId);

    expect(await activeOrganizationOf(session.id)).toBeNull();
  });

  it("with several workspaces, opens the one used in the last session", async () => {
    const first = await createTestTenant(connection.db);
    const second = await createTestTenant(connection.db, { userId: first.userId });
    const internal = (await authWith().$context).internalAdapter;
    const previous = await internal.createSession(first.userId);
    await connection.db
      .update(schema.session)
      .set({ activeOrganizationId: second.organizationId })
      .where(eq(schema.session.id, previous.id));

    const session = await internal.createSession(first.userId);

    expect(await activeOrganizationOf(session.id)).toBe(second.organizationId);
  });
});

describe("entrar como cualquiera (solo /dev/sign-in en pnpm dev)", () => {
  const devAuth = () =>
    createAuth({
      db: connection.db,
      mailer: { send: async () => {} },
      baseURL,
      secret: "x".repeat(32),
      methods: ["magic-link"],
      rateLimit: false,
      devSignIn: true,
    });

  it("signs in and sets the session cookie", async () => {
    const tenant = await createTestTenant(connection.db);

    const { headers } = await devAuth().api.devSignIn({
      body: { userId: tenant.userId },
      returnHeaders: true,
    });

    const cookie = headers.get("set-cookie") ?? "";
    const session = await devAuth().api.getSession({
      headers: new Headers({ cookie: cookie.split(";")[0] ?? "" }),
    });
    expect(session?.user.id).toBe(tenant.userId);
  });

  it("when off (as in production) lets nobody in", async () => {
    const tenant = await createTestTenant(connection.db);

    await expect(authWith().api.devSignIn({ body: { userId: tenant.userId } })).rejects.toThrow();
  });

  it("doesn't exist over HTTP even when on", async () => {
    const tenant = await createTestTenant(connection.db);

    const response = await devAuth().handler(
      new Request(`${baseURL}/api/auth/dev-sign-in`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: baseURL },
        body: JSON.stringify({ userId: tenant.userId }),
      }),
    );

    expect(response.status).toBe(404);
  });
});

describe("member and workspace endpoints don't exist over HTTP", () => {
  it.each(["invite-member", "update-member-role", "remove-member", "create"])(
    "/organization/%s responde 404",
    async (path) => {
      const response = await authWith().handler(
        new Request(`${baseURL}/api/auth/organization/${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: baseURL },
          body: JSON.stringify({ email: "x@test.monaztore.com", role: "owner", name: "x" }),
        }),
      );

      expect(response.status).toBe(404);
    },
  );
});
