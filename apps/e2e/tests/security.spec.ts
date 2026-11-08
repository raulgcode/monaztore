import type { Page } from "@playwright/test";
import { expect, ownerTest, test } from "../support/fixtures";
import { openSection } from "../support/navigation";

/** CSP violations the browser reports while the page loads and hydrates. */
function cspViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  return violations;
}

test.describe("Feature: the app protects itself in the browser", () => {
  test("Scenario: the home page and the login come with their headers and no foreign scripts", async ({
    page,
  }) => {
    const violations = cspViolations(page);

    for (const path of ["/", "/login"]) {
      await test.step(`When someone opens ${path}`, async () => {
        const response = await page.goto(path);
        const headers = response?.headers() ?? {};

        expect(headers["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+'/);
        expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
        expect(headers["x-frame-options"]).toBe("DENY");
        expect(headers["x-content-type-options"]).toBe("nosniff");
      });
    }

    await test.step("Then the page works (it hydrated) and broke no rule", async () => {
      await page.getByLabel("Email").fill("not-an-email");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByText("Enter a valid email")).toBeVisible();
      expect(violations).toEqual([]);
    });
  });

  test("Scenario: a redirect that tries to leave the site stays home", async ({ page }) => {
    const response = await page.request.post("/theme", {
      form: { theme: "dark", redirectTo: "/\\evil.example" },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(302);
    expect(response.headers().location).toBe("/");
  });

  test("Scenario: /dev/sign-in doesn't exist in the production build", async ({ page }) => {
    const response = await page.goto("/dev/sign-in");
    expect(response?.status()).toBe(404);
  });

  ownerTest(
    "Scenario: the workspace loads without breaking the content policy",
    async ({ page, workspace }) => {
      const violations = cspViolations(page);

      await test.step("When the owner opens the workspace and moves around", async () => {
        await page.goto(`/app/${workspace.slug}`);
        await openSection(page, "Settings");
      });

      await test.step("Then nothing was blocked", async () => {
        expect(violations).toEqual([]);
      });
    },
  );
});
