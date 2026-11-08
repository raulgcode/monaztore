import { promoteSuperAdmins } from "@monaztore/core";
import type { Page } from "@playwright/test";
import { slugOf } from "../support/database";
import {
  adminSignInThroughEmail,
  authenticatorCode,
  expect,
  setUpAuthenticator,
  test,
} from "../support/fixtures";
import { uniqueEmail } from "../support/mailpit";
import { openAdminSection } from "../support/navigation";
import { addFingerprintReader } from "../support/passkeys";

test.describe("Feature: the platform's super admin panel", () => {
  test("Scenario: a store owner opening /admin gets a 404, as if it did not exist", async ({
    page,
    signInWithWorkspace,
  }) => {
    await test.step("Given a signed-in store owner", async () => {
      await signInWithWorkspace(page, "Chiva Shop");
    });

    await test.step("When they open /admin and its second step, Then both answer 404", async () => {
      for (const path of ["/admin", "/admin/mfa", "/admin/commission"]) {
        const response = await page.goto(path);
        expect(response?.status()).toBe(404);
      }
    });
  });

  test("Scenario: a new super admin sets up the authenticator app, keeps 8 recovery codes and reaches the stores", async ({
    page,
    baseURL,
    db,
  }) => {
    const email = uniqueEmail("admin");

    await test.step("Given someone made a super admin by the platform", async () => {
      await promoteSuperAdmins(db, [email]);
    });

    await test.step("When they sign in, Then the email link stops at the second step", async () => {
      await adminSignInThroughEmail(page, baseURL, email);
      await expect(
        page.getByRole("img", { name: "QR code for your authenticator app" }),
      ).toBeVisible();
    });

    await test.step("When they type a wrong first code, Then it says so and stays", async () => {
      await page.getByLabel("Code from the app").fill("000000");
      await page.getByRole("button", { name: "Turn on" }).click();
      await expect(page.getByText("That code didn't work.", { exact: false })).toBeVisible();
    });

    await test.step("When they confirm the app's code and save the codes, Then they see the stores", async () => {
      await setUpAuthenticator(page);
      await expect(page).toHaveURL(/\/admin$/);
      await expect(page.getByRole("heading", { level: 1, name: "Stores" })).toBeVisible();
    });

    await test.step("Then the log records the setup", async () => {
      await openAdminSection(page, "Log");
      await expect(page.getByRole("listitem").filter({ hasText: email }).first()).toContainText(
        "Set up the authenticator app",
      );
    });
  });

  test("Scenario: every new session asks for the code again and goes on to the page it asked for", async ({
    page,
    newVisitor,
    baseURL,
    signInAsSuperAdmin,
  }) => {
    const { email, secret } =
      await test.step("Given a super admin who set up their authenticator app", () =>
        signInAsSuperAdmin(page));
    const other = await newVisitor();

    await test.step("When they sign in on another device, Then the link stops at the code", async () => {
      await adminSignInThroughEmail(other, baseURL, email);
      await expect(other.getByRole("heading", { name: "Enter your code" })).toBeVisible();
      expect((await other.goto("/admin/log"))?.url()).toContain("/admin/mfa?redirectTo=");
    });

    await test.step("When they type a wrong code, Then it is refused", async () => {
      await other.getByLabel("Code from the app").fill("000000");
      await other.getByRole("button", { name: "Continue" }).click();
      await expect(other.getByText("That code didn't work.", { exact: false })).toBeVisible();
    });

    await test.step("When they type the app's next code, Then they reach the page they asked for", async () => {
      await other.getByLabel("Code from the app").fill(authenticatorCode(secret, 1));
      await other.getByRole("button", { name: "Continue" }).click();
      await expect(other).toHaveURL(/\/admin\/log$/);
      await expect(other.getByRole("heading", { level: 1, name: "Log" })).toBeVisible();
    });
  });

  test("Scenario: a super admin adds their fingerprint and the next session gets in with it, without the code", async ({
    page,
    baseURL,
    signInAsSuperAdmin,
  }) => {
    const { email } =
      await test.step("Given a super admin on a device with a fingerprint reader", async () => {
        const admin = await signInAsSuperAdmin(page);
        await addFingerprintReader(page);
        return admin;
      });

    await test.step("When they add their fingerprint in Security", async () => {
      await openAdminSection(page, "Security");
      await expect(page.getByText("You haven't added any yet.", { exact: false })).toBeVisible();
      await page.getByLabel("Name", { exact: true }).fill("My phone");
      await page.getByRole("button", { name: "Add fingerprint or key" }).click();
    });

    await test.step("Then it is on the list, not used yet", async () => {
      await expect(page.getByRole("status").filter({ hasText: "Done" })).toHaveText(
        "Done: next time, get in with “My phone”.",
      );
      const list = page.getByRole("list", { name: "Your fingerprints and keys" });
      await expect(list.getByRole("listitem")).toHaveCount(1);
      await expect(list.getByRole("listitem")).toContainText("My phone");
      await expect(list.getByRole("listitem")).toContainText("Not used yet");
    });

    await test.step("When they sign in again and use their fingerprint instead of the code", async () => {
      await page.context().clearCookies();
      await adminSignInThroughEmail(page, baseURL, email);
      await expect(page.getByRole("heading", { name: "Confirm it's you" })).toBeVisible();
      await page.getByRole("button", { name: "Use fingerprint or key" }).click();
    });

    await test.step("Then they reach /admin, and the list says when it was used", async () => {
      await expect(page).toHaveURL(/\/admin$/);
      await openAdminSection(page, "Security");
      await expect(page.getByRole("list", { name: "Your fingerprints and keys" })).toContainText(
        "Last used on",
      );
    });

    await test.step("When they remove it, Then the next sign-in asks for the code again", async () => {
      await page.getByRole("button", { name: "Remove My phone" }).click();
      await expect(page.getByText("You haven't added any yet.", { exact: false })).toBeVisible();
      await page.context().clearCookies();
      await adminSignInThroughEmail(page, baseURL, email);
      await expect(page.getByRole("heading", { name: "Enter your code" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Use fingerprint or key" })).toHaveCount(0);
    });
  });

  test("Scenario: the super admin finds a store by its owner's email and gives it its own 1.5 % commission", async ({
    page,
    newVisitor,
    signInWithWorkspace,
    signInAsSuperAdmin,
  }) => {
    const ownerPage = await newVisitor();
    const ownerEmail = await test.step("Given an owner with the store Pura Vida Crafts", () =>
      signInWithWorkspace(ownerPage, "Pura Vida Crafts"));

    await test.step("And a signed-in super admin", async () => {
      await signInAsSuperAdmin(page);
    });

    await test.step("When they search the store list by the owner's email", async () => {
      await page.getByRole("searchbox", { name: "Search" }).fill(ownerEmail);
      await page.getByRole("button", { name: "Search" }).click();
      await expect(page).toHaveURL(/\?q=/);
    });

    await test.step("Then exactly that store is listed, following the platform's commission", async () => {
      await expect(page.getByRole("main").getByRole("status")).toHaveText("1 store");
      const store = page.getByRole("link", { name: /Pura Vida Crafts/ });
      await expect(store).toContainText(ownerEmail);
      await expect(store).toContainText("0 products · 0 orders");
      await store.click();
      await expect(page.getByRole("heading", { level: 1, name: "Pura Vida Crafts" })).toBeVisible();
      await expect(page.getByText("Following the platform's:", { exact: false })).toBeVisible();
      await expect(page.getByText(ownerEmail, { exact: true })).toBeVisible();
      await expect(page.getByText("Owner · Second step on")).toBeVisible();
    });

    await test.step("When they type 25 %, Then it is refused", async () => {
      await page.getByLabel("Commission (%)").fill("25");
      await page.getByRole("button", { name: "Save commission" }).click();
      await expect(page.getByText("The commission can't be more than 20 %")).toBeVisible();
    });

    await test.step("When they save 1.5 % with the reason", async () => {
      await page.getByLabel("Commission (%)").fill("1,5");
      await page.getByLabel("Why (only super admins see it)").fill("Founding partner");
      await page.getByRole("button", { name: "Save commission" }).click();
    });

    await test.step("Then the store pays 1.5 % and its log says who changed it", async () => {
      await expect(page.getByText("This store pays 1.5 %.")).toBeVisible();
      const log = page.getByRole("region", { name: "What changed in this store" });
      await expect(log.getByRole("listitem")).toHaveCount(1);
      await expect(log.getByRole("listitem")).toContainText("Changed a store's commission");
    });

    await test.step("And the store list marks its own commission", async () => {
      await page.getByRole("link", { name: "All stores" }).click();
      await page.getByRole("searchbox", { name: "Search" }).fill(ownerEmail);
      await page.getByRole("button", { name: "Search" }).click();
      await expect(page.getByRole("main").getByRole("status")).toHaveText("1 store");
      await expect(page.getByRole("link", { name: /Pura Vida Crafts/ })).toContainText(
        "Own commission: 1.5 %",
      );
    });
  });

  test("Scenario: support enters a store as its owner, its change goes to the log and it goes back to admin", async ({
    page,
    newVisitor,
    signInWithWorkspace,
    signInAsSuperAdmin,
    expectAccessible,
  }) => {
    const ownerPage = await newVisitor();
    const ownerEmail = await test.step("Given an owner with the store Café Tica", () =>
      signInWithWorkspace(ownerPage, "Café Tica"));
    const slug = slugOf(ownerPage);

    await test.step("And a super admin on that store's detail", async () => {
      await signInAsSuperAdmin(page);
      await openStoreDetail(page, ownerEmail, "Café Tica");
      await expect(
        page.getByText(`Opens the store's panel as its owner, ${ownerEmail}, for an hour.`, {
          exact: false,
        }),
      ).toBeVisible();
      await expect(page.getByText("The store isn't told about the visit.")).toBeVisible();
    });

    await test.step("When they enter as the owner", async () => {
      await page.getByRole("button", { name: "Enter as the owner" }).click();
    });

    await test.step("Then the store's home opens without a second step, under the support banner", async () => {
      await expect(page).toHaveURL(new RegExp(`/app/${slug}$`));
      await expect(page.getByRole("region", { name: "Back to admin" })).toHaveText(
        `Support: you're inside ${ownerEmail}'s accountBack to admin`,
      );
      await expect(page.getByText("This is the home of Café Tica.")).toBeVisible();
      await expectAccessible(page);
    });

    await test.step("When they create a page in the store", async () => {
      await page.goto(`/app/${slug}/pages`);
      await page.getByRole("button", { name: "New page" }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Edit “New page”");
    });

    await test.step("And go back to admin", async () => {
      await page.getByRole("button", { name: "Back to admin" }).click();
    });

    await test.step("Then they are on the store's detail, and its log has the visit and the change", async () => {
      await expect(page).toHaveURL(/\/admin\/stores\//);
      const log = page.getByRole("region", { name: "What changed in this store" });
      await expect(log.getByRole("listitem")).toHaveCount(3);
      await expect(log.getByRole("listitem").nth(0)).toContainText("Left the store");
      await expect(log.getByRole("listitem").nth(1)).toContainText(
        `Made a change inside the store`,
      );
      await expect(log.getByRole("listitem").nth(1)).toContainText(`POST /app/${slug}/pages`);
      await expect(log.getByRole("listitem").nth(2)).toContainText(
        "Entered the store as its owner",
      );
    });

    await test.step("And the owner's own session still works", async () => {
      await ownerPage.reload();
      await expect(ownerPage.getByText("This is the home of Café Tica.")).toBeVisible();
    });
  });

  test("Scenario: support that only looks can't change anything in the store", async ({
    page,
    newVisitor,
    signInWithWorkspace,
    signInAsSuperAdmin,
  }) => {
    const ownerPage = await newVisitor();
    const ownerEmail = await test.step("Given an owner with the store Soda La Esquina", () =>
      signInWithWorkspace(ownerPage, "Soda La Esquina"));
    const slug = slugOf(ownerPage);

    await test.step("And a super admin who chose to only look", async () => {
      await signInAsSuperAdmin(page);
      await openStoreDetail(page, ownerEmail, "Soda La Esquina");
      await page.getByRole("button", { name: "Only look" }).click();
      await expect(page.getByRole("region", { name: "Back to admin" })).toContainText(
        `Support, only looking: ${ownerEmail}`,
      );
    });

    await test.step("When they try to create a page", async () => {
      await page.goto(`/app/${slug}/pages`);
      await page.getByRole("button", { name: "New page" }).click();
    });

    await test.step("Then it is refused and the store has no new page", async () => {
      await expect(page.getByText("Error 403")).toBeVisible();
      await page.goto(`/app/${slug}/pages`);
      await expect(page.getByRole("link", { name: /^New page/ })).toHaveCount(0);
    });

    await test.step("And the log marks the visit as only looking", async () => {
      await page.getByRole("button", { name: "Back to admin" }).click();
      const log = page.getByRole("region", { name: "What changed in this store" });
      await expect(log.getByRole("listitem")).toHaveCount(2);
      await expect(log.getByRole("listitem").nth(1)).toContainText("Only looking");
    });
  });
});

async function openStoreDetail(page: Page, ownerEmail: string, name: string): Promise<void> {
  await page.getByRole("searchbox", { name: "Search" }).fill(ownerEmail);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("1 store");
  await page.getByRole("link", { name: new RegExp(name) }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}
