import { expect, ownerTest as test } from "../support/fixtures";
import { openStore } from "../support/storefront";

test.describe("Feature: the store on its own domain", () => {
  test("Scenario: a shopper opens the store, sees only what is for sale and opens a product with its price and stock", async ({
    page,
    workspace,
    baseURL,
  }) => {
    const store = await test.step("Given a store with an imported catalog on its own domain", () =>
      openStore(workspace, baseURL));

    await test.step("When a shopper opens the store", async () => {
      await page.goto(store);
    });

    await test.step("Then the front page lists the active products, not the draft", async () => {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("My company");
      await expect(page.getByRole("link", { name: /Pura Vida mug/ })).toBeVisible();
      await expect(page.getByRole("link", { name: /Coffee beans/ })).toContainText("Sold out");
      await expect(page.getByText("Secret draft")).toHaveCount(0);
    });

    await test.step("When they open the mug", async () => {
      await page.getByRole("link", { name: /Pura Vida mug/ }).click();
    });

    await test.step("Then they see its price on sale, its stock and its SEO title", async () => {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pura Vida mug");
      await expect(page.getByText("₡5,990")).toBeVisible();
      await expect(page.getByText("In stock")).toBeVisible();
      await expect(page).toHaveTitle("Pura Vida mug, made in Costa Rica");
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        `${store}/products/pura-vida-mug`,
      );
    });
  });

  test("Scenario: an address of the old shop moves for good to the same product in the new store", async ({
    page,
    workspace,
    baseURL,
  }) => {
    const store = await openStore(workspace, baseURL);

    const response = await test.step("When a shopper follows an old WooCommerce link", () =>
      page.request.get(`${store}/product/pura-vida-mug/`, { maxRedirects: 0 }));

    await test.step("Then it answers 301 to the product's new address", async () => {
      expect(response.status()).toBe(301);
      expect(response.headers().location).toBe("/products/pura-vida-mug");
    });
  });

  test("Scenario: a search finds products by name and says how many", async ({
    page,
    workspace,
    baseURL,
  }) => {
    const store = await openStore(workspace, baseURL);
    await page.goto(store);

    await test.step("When the shopper searches for “coffee”", async () => {
      await page.getByRole("searchbox", { name: "Search products" }).fill("coffee");
      await page.getByRole("button", { name: "Search" }).click();
    });

    await test.step("Then only the coffee beans show up", async () => {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Results for “coffee”");
      await expect(page.getByRole("main").getByRole("status")).toHaveText("1 product");
      await expect(page.getByRole("link", { name: /Coffee beans/ })).toBeVisible();
    });
  });

  test("Scenario: a draft product and an unknown address answer that they don't exist", async ({
    page,
    workspace,
    baseURL,
  }) => {
    const store = await openStore(workspace, baseURL);

    const draft = await page.goto(`${store}/products/secret-draft`);

    expect(draft?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find this page");
    // Still inside the store: its name heads the page.
    await expect(page.getByRole("link", { name: "My company" })).toBeVisible();
    expect((await page.goto(`${store}/nothing-here`))?.status()).toBe(404);
  });

  test("Scenario: search engines get the store's sitemap and robots.txt", async ({
    page,
    workspace,
    baseURL,
  }) => {
    const store = await openStore(workspace, baseURL);

    const sitemap = await (await page.request.get(`${store}/sitemap.xml`)).text();
    const robots = await (await page.request.get(`${store}/robots.txt`)).text();

    expect(sitemap).toContain(`<loc>${store}/products/pura-vida-mug</loc>`);
    expect(sitemap).not.toContain("secret-draft");
    expect(robots).toContain(`Sitemap: ${store}/sitemap.xml`);
  });

  test("Scenario: a product page of the platform's own host answers 404", async ({ page }) => {
    expect((await page.goto("/products/pura-vida-mug"))?.status()).toBe(404);
  });
});
