import { expect, ownerTest, test } from "../support/fixtures";

const schemes = ["light", "dark"] as const;
// Public pages, before signing in.
const publicPages = ["/", "/login", "/login?with=link", "/sign-up", "/forgot-password"];
// Sections inside the workspace, after /app/:workspace. A new section goes here.
const workspaceSections = ["", "/settings"];

test.describe("Feature: accessibility (axe, WCAG 2.2 AA)", () => {
  for (const colorScheme of schemes) {
    test.describe(`${colorScheme} theme`, () => {
      test.use({ colorScheme });

      for (const path of publicPages) {
        test(`Scenario: ${path} has no violations`, async ({ page, expectAccessible }) => {
          await page.goto(path);
          await expectAccessible(page);
        });
      }

      ownerTest(
        "Scenario: the workspace sections have no violations",
        async ({ page, workspace, expectAccessible }) => {
          for (const section of workspaceSections) {
            await page.goto(`/app/${workspace.slug}${section}`);
            await expectAccessible(page);
          }
        },
      );
    });
  }

  test("Scenario: a form's errors have no violations either", async ({
    page,
    expectAccessible,
  }) => {
    await page.goto("/sign-up");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter your name")).toBeVisible();
    await expectAccessible(page);
  });
});
