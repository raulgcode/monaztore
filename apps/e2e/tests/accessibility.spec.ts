import { expect, ownerTest, test } from "../support/fixtures";
import { openStore, placeSampleOrder } from "../support/storefront";

const schemes = ["light", "dark"] as const;
// Public pages, before signing in.
const publicPages = ["/", "/login", "/login?with=link", "/sign-up", "/forgot-password"];
// Sections inside the workspace, after /app/:workspace. A new section goes here.
const workspaceSections = ["", "/orders", "/pages", "/store", "/invoicing", "/settings"];
// Storefront pages, on a store's own domain. A new storefront page goes here.
const storePages = [
  "/",
  "/products",
  "/products/pura-vida-mug",
  "/collections",
  "/collections/kitchen",
  "/questions",
];

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
        "Scenario: the storefront pages have no violations",
        async ({ page, workspace, baseURL, expectAccessible }) => {
          const store = await openStore(workspace, baseURL);
          for (const path of storePages) {
            await page.goto(`${store}${path}`);
            await expectAccessible(page);
          }
          // The cart and checkout, with the mug in the cart.
          await page.goto(`${store}/products/pura-vida-mug`);
          await page.getByRole("button", { name: "Add to cart" }).click();
          await expect(page.getByRole("main").getByRole("status")).toContainText("Added");
          for (const path of ["/cart", "/checkout"]) {
            await page.goto(`${store}${path}`);
            await expectAccessible(page);
          }
        },
      );

      ownerTest(
        "Scenario: the workspace sections have no violations",
        async ({ page, workspace, expectAccessible }) => {
          const order = await placeSampleOrder(workspace, { name: "Ana Mora", reference: "1" });
          for (const section of [...workspaceSections, `/orders/${order}`]) {
            await page.goto(`/app/${workspace.slug}${section}`);
            await expectAccessible(page);
          }
          // The page editor, with the sample store's "Questions" page.
          await page.goto(`/app/${workspace.slug}/pages`);
          await page.getByRole("link", { name: /^Questions/ }).click();
          await expect(page.getByRole("heading", { level: 1 })).toHaveText("Edit “Questions”");
          await expectAccessible(page);
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
