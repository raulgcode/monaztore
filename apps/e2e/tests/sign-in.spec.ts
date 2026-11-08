import { expect, test } from "../support/fixtures";
import { getLinkFromEmail, uniqueEmail } from "../support/mailpit";

test.describe("Feature: sign in with an email link", () => {
  test("Scenario: someone new asks for the link, opens it and lands on creating their workspace", async ({
    page,
    baseURL,
  }) => {
    const email = uniqueEmail("link");

    await test.step("Given a visitor on the login page, choosing the link", async () => {
      await page.goto("/login");
      await page.getByRole("link", { name: "Email me a link instead, no password" }).click();
    });

    await test.step("When they ask for the link with their email", async () => {
      await page.getByLabel("Email").fill(email);
      await page.getByRole("button", { name: "Email me the link" }).click();
    });

    await test.step("Then the page says where it went", async () => {
      await expect(page.getByRole("main").getByRole("status")).toHaveText(
        `We sent a link to ${email}. Open it on this device to sign in.`,
      );
    });

    await test.step("And opening it signs them in, on the onboarding", async () => {
      await page.goto(await getLinkFromEmail(email, baseURL, "Your sign-in link"));
      await expect(page).toHaveURL(/\/app\/onboarding$/);
      await expect(
        page.getByRole("heading", { level: 1, name: "Create your workspace" }),
      ).toBeVisible();
    });
  });

  test("Scenario: a mistyped email sends nothing and says why", async ({ page }) => {
    await page.goto("/login?with=link");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByRole("button", { name: "Email me the link" }).click();
    await expect(page.getByText("Enter a valid email")).toBeVisible();
    await expect(page.getByRole("main").getByRole("status")).toHaveCount(0);
  });
});

test.describe("Feature: account with email and password", () => {
  const password = "a-long-password";

  test("Scenario: they create an account, confirm the email and get in to create their workspace", async ({
    page,
    baseURL,
  }) => {
    const email = uniqueEmail("password");

    await test.step("Given a visitor on the sign-up page", async () => {
      await page.goto("/login");
      await page.getByRole("link", { name: "Create one" }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Create your account" }),
      ).toBeVisible();
    });

    await test.step("When they sign up with name, email and password", async () => {
      await page.getByLabel("Your name").fill("Ana Smith");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: "Create account" }).click();
    });

    await test.step("Then they are asked to confirm their email", async () => {
      await expect(page.getByRole("main").getByRole("status")).toHaveText(
        `We sent a link to ${email} to confirm your account. Open it to sign in.`,
      );
    });

    await test.step("And the confirmation link signs them in", async () => {
      await page.goto(await getLinkFromEmail(email, baseURL, "Confirm your email"));
      await expect(page).toHaveURL(/\/app\/onboarding$/);
    });
  });

  test("Scenario: a wrong password doesn't get in and says so", async ({ page, baseURL }) => {
    const email = await test.step("Given someone with a confirmed account", async () => {
      const email = uniqueEmail("wrong");
      await page.goto("/sign-up");
      await page.getByLabel("Your name").fill("Luis");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: "Create account" }).click();
      await page.goto(await getLinkFromEmail(email, baseURL, "Confirm your email"));
      await page.context().clearCookies();
      return email;
    });

    await test.step("When they sign in with another password", async () => {
      await page.goto("/login");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill("another-long-password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
    });

    await test.step("Then they stay on the login page with the reason", async () => {
      await expect(page.getByRole("alert")).toHaveText("The email or the password doesn't match.");
      await expect(page).toHaveURL(/\/login/);
    });

    await test.step("And with the right one they get in", async () => {
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/app\/onboarding$/);
    });
  });

  test("Scenario: they forgot their password, choose another from the link and sign in with it", async ({
    page,
    baseURL,
  }) => {
    const email = uniqueEmail("reset");

    await test.step("Given someone with a confirmed account", async () => {
      await page.goto("/sign-up");
      await page.getByLabel("Your name").fill("Marta");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: "Create account" }).click();
      await page.goto(await getLinkFromEmail(email, baseURL, "Confirm your email"));
      await page.context().clearCookies();
    });

    await test.step("When they ask for a new password", async () => {
      await page.goto("/login");
      await page.getByRole("link", { name: "Forgot your password?" }).click();
      // The login has an Email field too: wait for the new page before typing.
      await expect(page).toHaveURL(/\/forgot-password$/);
      await page.getByLabel("Email").fill(email);
      await page.getByRole("button", { name: "Email me the link" }).click();
      await expect(page.getByRole("main").getByRole("status")).toContainText(email);
    });

    await test.step("And choose one from the email's link", async () => {
      await page.goto(await getLinkFromEmail(email, baseURL, "Choose a new password"));
      await page.getByLabel("New password").fill("my-new-password");
      await page.getByRole("button", { name: "Save password" }).click();
      await expect(page.getByRole("main").getByRole("status")).toHaveText(
        "Done, you can sign in with your new password.",
      );
    });

    await test.step("Then the new password signs them in", async () => {
      await page.getByRole("link", { name: "Back to sign in" }).click();
      await expect(page).toHaveURL(/\/login\?with=password$/);
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill("my-new-password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/app\/onboarding$/);
    });
  });
});

test.describe("Feature: sign in with Google", () => {
  test("Scenario: the Google button takes them to pick their account", async ({
    page,
    baseURL,
  }) => {
    // Playwright can't stop the redirect itself, so catch the app's 302 and stop there: the
    // test never talks to the real Google.
    let googleUrl: URL | undefined;
    let setCookie = "";
    await page.route(
      (url) => url.pathname === "/login",
      async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        const response = await route.fetch({ maxRedirects: 0 });
        googleUrl = new URL(response.headers().location ?? "", baseURL);
        setCookie = response.headers()["set-cookie"] ?? "";
        await route.fulfill({ contentType: "text/html", body: "<title>Google</title>" });
      },
    );

    await test.step("Given a visitor on the login page", async () => {
      await page.goto("/login");
    });

    await test.step("When they choose to continue with Google", async () => {
      await page.getByRole("button", { name: "Continue with Google" }).click();
      await expect(page).toHaveTitle("Google");
    });

    await test.step("Then Google is asked to send them back here", async () => {
      expect(googleUrl?.origin).toBe("https://accounts.google.com");
      expect(googleUrl?.searchParams.get("client_id")).toBe("e2e.apps.googleusercontent.com");
      expect(googleUrl?.searchParams.get("redirect_uri")).toBe(
        `${baseURL}/api/auth/callback/google`,
      );
      // The OAuth state cookie must travel with the redirect, or the callback is rejected.
      expect(setCookie).toContain("better-auth.state=");
    });
  });

  test("Scenario: if Google fails they come back to the login with a notice", async ({ page }) => {
    await page.goto("/login?error=access_denied");
    await expect(page.getByRole("alert")).toHaveText(
      "We couldn't sign you in with Google. Try again or use your email.",
    );
    await expect(page.getByLabel("Email")).toBeVisible();
  });
});
