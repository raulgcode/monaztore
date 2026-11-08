import { storeThemeIds, storeThemeSchema } from "@monaztore/contracts";
import { markOrderPaid, promoteSuperAdmins, updateStoreTheme } from "@monaztore/core";
import {
  adminSignInThroughEmail,
  expect,
  ownerTest,
  setUpAuthenticator,
  test,
} from "../support/fixtures";
import { getLinkFromEmail, uniqueEmail } from "../support/mailpit";
import {
  catalogWithCopiedPhoto,
  openStore,
  placeSampleOrder,
  sellEbook,
} from "../support/storefront";

const schemes = ["light", "dark"] as const;
// Public pages, before signing in.
const publicPages = ["/", "/login", "/login?with=link", "/sign-up", "/forgot-password"];
// Sections inside the workspace, after /app/:workspace. A new section goes here.
const workspaceSections = [
  "",
  "/orders",
  "/products",
  "/products/new",
  "/collections",
  "/coupons",
  "/coupons/new",
  "/pages",
  "/store",
  "/downloads",
  "/downloads/new",
  "/design",
  "/invoicing",
  "/settings",
  "/settings/security",
];
// The platform's /admin, after its second step. A new admin section goes here.
const adminSections = ["", "/commission", "/log", "/security"];
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

      test("Scenario: the super admin's second step and every /admin section have no violations", async ({
        page,
        baseURL,
        db,
        expectAccessible,
      }) => {
        const email = uniqueEmail("admin");
        await promoteSuperAdmins(db, [email]);
        await adminSignInThroughEmail(page, baseURL, email);
        await expectAccessible(page);
        await setUpAuthenticator(page);
        for (const path of adminSections) {
          await page.goto(`/admin${path}`);
          await expectAccessible(page);
        }
        // A store's detail: the newest one on the list.
        await page.goto("/admin");
        await page.getByRole("main").getByRole("listitem").first().getByRole("link").click();
        await expect(page).toHaveURL(/\/admin\/stores\//);
        await expectAccessible(page);
      });

      test("Scenario: the team's second step has no violations", async ({
        page,
        baseURL,
        expectAccessible,
      }) => {
        const email = uniqueEmail("team");
        await page.goto("/login?with=link");
        await page.getByLabel("Email").fill(email);
        await page.getByRole("button", { name: "Email me the link" }).click();
        await expect(page.getByRole("main").getByRole("status")).toContainText(email);
        await page.goto(await getLinkFromEmail(email, baseURL));
        await expect(page).toHaveURL(/\/app\/mfa\?redirectTo=/);
        await expectAccessible(page);
      });

      ownerTest(
        "Scenario: the storefront pages have no violations",
        async ({ page, workspace, baseURL, expectAccessible }) => {
          // The mug with three photos, so its page has the photo carousel.
          const store = await openStore(
            workspace,
            baseURL,
            await catalogWithCopiedPhoto(workspace, 3),
          );
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
          // A paid order of a digital product: its downloads on the order and the email's page.
          const { slug } = await sellEbook(workspace);
          await page.goto(`${store}/products/${slug}`);
          await expectAccessible(page);
          await page.context().clearCookies({ domain: new URL(store).hostname });
          await page.goto(`${store}/products/${slug}`);
          await page.getByRole("button", { name: "Add to cart" }).click();
          await expect(page.getByRole("main").getByRole("status")).toContainText("Added");
          await page.goto(`${store}/checkout`);
          await expectAccessible(page);
          await page.getByLabel("Email", { exact: true }).fill("ana@example.com");
          await page.getByLabel("Full name").fill("Ana Mora");
          await page.getByLabel("Phone", { exact: true }).fill("8888-0000");
          await page.getByRole("button", { name: "Place order" }).click();
          await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Order #\d+$/);
          const number = Number(
            (await page.getByRole("heading", { level: 1 }).textContent())?.replace(/\D/g, ""),
          );
          const { downloads } = await markOrderPaid(workspace.tenant, number);
          await page.reload();
          await expect(
            page.getByRole("link", { name: "Download Brewing handbook.pdf" }),
          ).toBeVisible();
          await expectAccessible(page);
          await page.goto(`${store}/downloads/${downloads?.token}`);
          await expectAccessible(page);
        },
      );

      test("Scenario: every store theme, with its filters on, has no violations", async ({
        page,
        baseURL,
        signInWithWorkspace,
        workspaceOf,
        expectAccessible,
      }) => {
        await signInWithWorkspace(page);
        const workspace = await workspaceOf(page);
        const store = await openStore(workspace, baseURL);
        for (const theme of storeThemeIds) {
          await updateStoreTheme(
            workspace.tenant,
            storeThemeSchema.parse({ theme, announcement: "Free delivery over ₡25 000" }),
          );
          for (const path of ["/", "/products?stock=1&sort=price-asc"]) {
            await page.goto(`${store}${path}`);
            await expectAccessible(page);
          }
          // The search box with its suggestions open, one marked.
          const box = page.getByRole("combobox", { name: "Search products" });
          await box.pressSequentially("co");
          await expect(page.getByRole("listbox", { name: "Suggestions" })).toBeVisible();
          await box.press("ArrowDown");
          await expectAccessible(page);
        }
      });

      ownerTest(
        "Scenario: the workspace sections have no violations",
        async ({ page, workspace, expectAccessible }) => {
          const order = await placeSampleOrder(workspace, { name: "Ana Mora", reference: "1" });
          const { id: ebook } = await sellEbook(workspace);
          for (const section of [...workspaceSections, `/orders/${order}`, `/downloads/${ebook}`]) {
            await page.goto(`/app/${workspace.slug}${section}`);
            await expectAccessible(page);
          }
          // A product's editor, with the sample store's mug and its photo.
          await page.goto(`/app/${workspace.slug}/products?q=Pura`);
          await page
            .getByRole("link", { name: /^Pura Vida mug/ })
            .first()
            .click();
          await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pura Vida mug");
          await expectAccessible(page);
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
