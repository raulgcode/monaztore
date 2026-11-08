import { createWorkspace, expect, ownerTest, test } from "../support/fixtures";
import { getLinkFromEmail } from "../support/mailpit";
import { openSection } from "../support/navigation";
import { addFingerprintReader } from "../support/passkeys";

test.describe("Feature: the workspace", () => {
  test("Scenario: someone signing in for the first time creates their workspace and lands on its home", async ({
    page,
    signIn,
  }) => {
    await test.step("Given someone who just signed in", async () => {
      await signIn(page);
    });

    await test.step("When they name their workspace", async () => {
      await createWorkspace(page, "Moon Café");
    });

    await test.step("Then its home greets them in that workspace", async () => {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Hi, /);
      await expect(page.getByText("This is the home of Moon Café.")).toBeVisible();
    });
  });

  test("Scenario: a one-letter name doesn't create the workspace and says why", async ({
    page,
    signIn,
  }) => {
    await signIn(page);
    await page.getByLabel("Workspace name").fill("A");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("The name needs at least 2 characters")).toBeVisible();
    await expect(page).toHaveURL(/\/app\/onboarding$/);
  });

  ownerTest("Scenario: /app opens the workspace used last", async ({ page, workspace }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(new RegExp(`/app/${workspace.slug}$`));
  });

  ownerTest(
    "Scenario: someone else's workspace answers that it doesn't exist",
    async ({ page, newVisitor, signInWithWorkspace }) => {
      const other = await test.step("Given someone else's workspace", async () => {
        const visitor = await newVisitor();
        await signInWithWorkspace(visitor, "Theirs");
        return visitor.url();
      });

      await test.step("When the owner opens its address", async () => {
        const response = await page.goto(other);
        expect(response?.status()).toBe(404);
      });

      await test.step("Then the page says it was not found", async () => {
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          "We couldn't find this page",
        );
      });
    },
  );

  // Its own account: the language is saved on the account too, and the worker's owner is shared.
  test("Scenario: they switch the language to Spanish in Settings", async ({
    page,
    signInWithWorkspace,
  }) => {
    await test.step("Given an owner on their settings", async () => {
      await signInWithWorkspace(page);
      await openSection(page, "Settings");
    });

    await test.step("When they pick Spanish", async () => {
      await page.getByRole("radio", { name: "Español" }).check();
    });

    await test.step("Then the app answers in Spanish", async () => {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ajustes");
    });
  });

  // Its own account: signing out ends the session that the worker's `ownerTest`s share.
  test("Scenario: they sign out and /app asks them to sign in again", async ({
    page,
    signInWithWorkspace,
  }) => {
    await signInWithWorkspace(page);
    await openSection(page, "Settings");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fapp$/);
  });

  test("Scenario: an owner adds their fingerprint in Settings and the next sign-in gets in with it, without the code", async ({
    page,
    baseURL,
    signInWithWorkspace,
  }) => {
    const email =
      await test.step("Given an owner on a device with a fingerprint reader", async () => {
        const email = await signInWithWorkspace(page, "Huella Shop");
        await addFingerprintReader(page);
        return email;
      });

    await test.step("When they add their fingerprint from Settings", async () => {
      await openSection(page, "Settings");
      await page.getByRole("link", { name: "Fingerprints and keys" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Security" })).toBeVisible();
      await page.getByLabel("Name", { exact: true }).fill("My phone");
      await page.getByRole("button", { name: "Add fingerprint or key" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Done" })).toHaveText(
        "Done: next time, get in with “My phone”.",
      );
    });

    await test.step("And sign in again on this device", async () => {
      await page.context().clearCookies();
      await page.goto("/login?with=link");
      await page.getByLabel("Email").fill(email);
      await page.getByRole("button", { name: "Email me the link" }).click();
      await expect(page.getByRole("main").getByRole("status")).toContainText(email);
      await page.goto(await getLinkFromEmail(email, baseURL));
    });

    await test.step("Then the second step offers the fingerprint, and it opens their workspace", async () => {
      await expect(page.getByRole("heading", { level: 1, name: "Confirm it's you" })).toBeVisible();
      await page.getByRole("button", { name: "Use fingerprint or key" }).click();
      await expect(page).toHaveURL(/\/app\/[a-z0-9-]+-[0-9a-f]{6}$/);
      await expect(page.getByText("This is the home of Huella Shop.")).toBeVisible();
    });
  });
});
