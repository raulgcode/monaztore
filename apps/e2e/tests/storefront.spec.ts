import { expect, ownerTest as test } from "../support/fixtures";
import { catalogWithCopiedPhoto, openStore, requestStore } from "../support/storefront";

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
      const newArrivals = page.getByRole("region", { name: "New arrivals" });
      await expect(newArrivals.getByRole("link", { name: /Pura Vida mug/ })).toBeVisible();
      await expect(newArrivals.getByRole("link", { name: /Coffee beans/ })).toContainText(
        "Sold out",
      );
      await expect(page.getByText("Secret draft")).toHaveCount(0);
    });

    await test.step("When they open the mug", async () => {
      await page
        .getByRole("region", { name: "New arrivals" })
        .getByRole("link", { name: /Pura Vida mug/ })
        .click();
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

  test("Scenario: a migrated product shows its photo from the store's own files, not the old shop", async ({
    page,
    workspace,
    baseURL,
  }) => {
    const store =
      await test.step("Given the mug's photo was copied when the shop moved", async () =>
        openStore(workspace, baseURL, await catalogWithCopiedPhoto(workspace)));

    await test.step("When a shopper opens the mug", async () => {
      await page.goto(`${store}/products/pura-vida-mug`);
    });

    await test.step("Then the photo loads from the store itself and is shared with its full address", async () => {
      const photo = page.getByRole("img", { name: "White mug" });
      await expect(photo).toHaveAttribute("src", /^\/media\/organizations\/.+\.webp\?w=960$/);
      // It loads (a broken image has no width); its size follows the screen, from `srcset`.
      await expect
        .poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
        .toBe(true);
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
        "content",
        new RegExp(`^${store}/media/organizations/`),
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
      requestStore(page.request, store, "/product/pura-vida-mug/", { maxRedirects: 0 }));

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

    const sitemap = await (await requestStore(page.request, store, "/sitemap.xml")).text();
    const robots = await (await requestStore(page.request, store, "/robots.txt")).text();

    expect(sitemap).toContain(`<loc>${store}/products/pura-vida-mug</loc>`);
    expect(sitemap).toContain(`<loc>${store}/questions</loc>`);
    expect(sitemap).not.toContain("secret-draft");
    expect(robots).toContain(`Sitemap: ${store}/sitemap.xml`);
  });

  test("Scenario: a product page of the platform's own host answers 404", async ({ page }) => {
    expect((await page.goto("/products/pura-vida-mug"))?.status()).toBe(404);
  });
});
