import { createHash, randomBytes } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { expect, ownerTest, passSecondStep, test } from "../support/fixtures";
import { getLinkFromEmail, uniqueEmail } from "../support/mailpit";
import { openSection } from "../support/navigation";

// What an assistant (Claude, ChatGPT, an editor) does to connect: it registers itself, sends the
// person to authorize it, and trades the code for a token (OAuth 2.1 with PKCE).
const callback = "http://127.0.0.1:4999/callback";
const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");

/** The assistant registers itself the first time (RFC 7591), from its own server. */
async function registerAssistant(request: APIRequestContext): Promise<string> {
  const response = await request.post("/api/auth/oauth2/register", {
    data: {
      client_name: "Claude",
      redirect_uris: [callback],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { client_id: string }).client_id;
}

/** Where the assistant sends the person to allow it. */
const authorizeUrl = (clientId: string) =>
  `/api/auth/oauth2/authorize?${new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callback,
    scope: "store offline_access",
    state: "xyz",
    code_challenge: challenge,
    code_challenge_method: "S256",
  })}`;

test.describe("Feature: connecting an AI assistant to the stores", () => {
  ownerTest(
    "Scenario: the owner allows an assistant, it gets its token, and they disconnect it in Settings",
    async ({ page, playwright, baseURL, workspace }) => {
      // The assistant's own server: no cookies of the owner's browser.
      const request = await playwright.request.newContext({
        baseURL,
        storageState: { cookies: [], origins: [] },
      });
      const clientId = await test.step("Given an assistant registered itself", () =>
        registerAssistant(request));

      await test.step("When it sends the owner to allow it", async () => {
        // The assistant's own page: here, nothing answers it but the test.
        await page.route(`${callback}**`, (route) => route.fulfill({ body: "Connected" }));
        await page.goto(authorizeUrl(clientId));
      });

      await test.step("Then the consent page says who asks and lists the owner's store", async () => {
        await expect(
          page.getByRole("heading", { level: 1, name: "Claude wants to work in your stores" }),
        ).toBeVisible();
        await expect(page.getByRole("region", { name: "Your stores" })).toContainText("My company");
      });

      const code = await test.step("When the owner allows it", async () => {
        await page.getByRole("button", { name: "Allow", exact: true }).click();
        await page.waitForURL(`${callback}**`);
        const back = new URL(page.url());
        expect(back.searchParams.get("state")).toBe("xyz");
        return back.searchParams.get("code") ?? "";
      });

      await test.step("Then the assistant trades the code for its token", async () => {
        const response = await request.post("/api/auth/oauth2/token", {
          form: {
            grant_type: "authorization_code",
            code,
            redirect_uri: callback,
            client_id: clientId,
            code_verifier: verifier,
          },
        });
        expect(response.status()).toBe(200);
        const token = (await response.json()) as { access_token: string; refresh_token?: string };
        expect(token.access_token).toMatch(/^mcp_at_/);
      });

      await test.step("When the owner opens Settings → AI assistants", async () => {
        await page.goto(`/app/${workspace.slug}`);
        await openSection(page, "Settings");
        await page.getByRole("link", { name: "Connect an assistant" }).click();
        await expect(page.getByRole("heading", { level: 1, name: "AI assistants" })).toBeVisible();
      });

      await test.step("Then the assistant is listed and the address to connect another shows", async () => {
        await expect(page.getByLabel("Connection address")).toHaveValue(/\/mcp$/);
        await expect(
          page.getByRole("region", { name: "Connected assistants" }).getByRole("listitem"),
        ).toContainText("Claude");
      });

      await test.step("When they disconnect it", async () => {
        await page.getByRole("button", { name: "Disconnect Claude" }).first().click();
      });

      await test.step("Then it is gone and the page says so", async () => {
        await expect(page.getByRole("main").getByRole("status")).toHaveText(
          "Claude was disconnected: it can't reach your stores any more.",
        );
      });
      await request.dispose();
    },
  );

  test("Scenario: someone signed out signs in and passes their second step, then sees what the assistant asks", async ({
    page,
    playwright,
    baseURL,
  }) => {
    const request = await playwright.request.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    const clientId = await test.step("Given an assistant registered itself", () =>
      registerAssistant(request));
    const email = uniqueEmail("assistant");

    await test.step("When it sends them to allow it, signed out", async () => {
      await page.goto(authorizeUrl(clientId));
      await expect(page).toHaveURL(/\/login\?/);
    });

    await test.step("And they sign in with the email link and set up their second step", async () => {
      await page.getByRole("link", { name: "Email me a link instead, no password" }).click();
      await page.getByLabel("Email").fill(email);
      await page.getByRole("button", { name: "Email me the link" }).click();
      await expect(page.getByRole("main").getByRole("status")).toContainText(email);
      await page.goto(await getLinkFromEmail(email, baseURL));
      await passSecondStep(page, email);
    });

    await test.step("Then the assistant's request goes on to the consent page", async () => {
      await expect(
        page.getByRole("heading", { level: 1, name: "Claude wants to work in your stores" }),
      ).toBeVisible();
      await expect(page.getByRole("region", { name: "Your stores" })).toContainText(
        "You aren't on any store's team yet.",
      );
    });
    await request.dispose();
  });
});
