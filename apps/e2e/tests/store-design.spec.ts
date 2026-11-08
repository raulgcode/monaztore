import { randomUUID } from "node:crypto";
import type { ImportedCatalog, ImportedProduct } from "@monaztore/contracts";
import { storeThemeSchema } from "@monaztore/contracts";
import { updateStoreTheme } from "@monaztore/core";
import { expect, test } from "../support/fixtures";
import { openSection } from "../support/navigation";
import { catalogWithCopiedPhoto, openStore } from "../support/storefront";

const sock = (
  slug: string,
  name: string,
  price: number,
  options: Record<string, string[]>,
): ImportedProduct => ({
  externalId: randomUUID(),
  slug,
  name,
  description: "",
  shortDescription: "",
  status: "active",
  sku: slug.toUpperCase(),
  price,
  compareAtPrice: null,
  stockQuantity: null,
  inStock: true,
  weightGrams: null,
  seoTitle: null,
  seoDescription: null,
  categoryExternalIds: [],
  images: [],
  options: Object.entries(options).map(([optionName, values]) => ({ name: optionName, values })),
  variants: [],
  oldPath: null,
});

/** A sock shop like Superchiva: sizes and colors to filter by. */
const sockCatalog: ImportedCatalog = {
  source: "woocommerce",
  sourceUrl: "https://socks.example",
  currency: "CRC",
  categories: [],
  products: [
    sock("striped", "Striped socks", 350_000, { Size: ["S", "M"], Color: ["Red"] }),
    sock("dotted", "Dotted socks", 450_000, { Size: ["M", "L"], Color: ["Blue"] }),
    sock("plain", "Plain socks", 550_000, { Size: ["L"], Color: ["Red"] }),
  ],
  customers: [],
  warnings: [],
};

test.describe("Feature: the store's design", () => {
  test("Scenario: the owner picks the Boutique theme in its Sand colors with an announcement and the store shows it", async ({
    page,
    baseURL,
    signInWithWorkspace,
    workspaceOf,
  }) => {
    const store = await test.step("Given an owner with a store on its own domain", async () => {
      await signInWithWorkspace(page, "Super Socks");
      return openStore(await workspaceOf(page), baseURL, sockCatalog);
    });

    await test.step("When they pick Boutique, its Sand colors, a title and an announcement in Design and save", async () => {
      await openSection(page, "Design");
      await page.getByText("Boutique", { exact: true }).click();
      await page.getByRole("group", { name: "Color set" }).getByText("Sand").click();
      await page.getByLabel("Title", { exact: true }).fill("Socks that tell stories");
      await page.getByLabel("Announcement at the top").fill("Free delivery over ₡25 000");
      await page.getByRole("button", { name: "Save design" }).click();
    });

    await test.step("Then the design is saved", async () => {
      await expect(page.getByRole("main").getByRole("status")).toHaveText(
        "Saved. Your store already looks like this.",
      );
    });

    await test.step("And the store's front page has the announcement, the title and the theme's promises", async () => {
      await page.goto(store);
      await expect(page.getByText("Free delivery over ₡25 000")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Socks that tell stories");
      await expect(page.getByText("Easy size exchanges")).toBeVisible();
    });

    await test.step("And its buttons wear Sand's rust color", async () => {
      await expect(page.getByRole("button", { name: "Search" })).toHaveCSS(
        "background-color",
        "rgb(154, 52, 18)",
      );
    });
  });

  test("Scenario: a shopper goes through a product's photos with the arrows and the thumbnails", async ({
    page,
    baseURL,
    signInWithWorkspace,
    workspaceOf,
  }) => {
    const store = await test.step("Given a store with a mug that has three photos", async () => {
      await signInWithWorkspace(page);
      const workspace = await workspaceOf(page);
      return openStore(workspace, baseURL, await catalogWithCopiedPhoto(workspace, 3));
    });

    await test.step("When the shopper opens the mug", async () => {
      await page.goto(`${store}/products/pura-vida-mug`);
    });

    await test.step("Then the first photo is on and there is no way back yet", async () => {
      await expect(page.getByRole("button", { name: "Show photo 1 of 3" })).toHaveAttribute(
        "aria-current",
        "true",
      );
      await expect(page.getByRole("button", { name: "Previous photo" })).toBeDisabled();
    });

    await test.step("When they tap the next arrow", async () => {
      await page.getByRole("button", { name: "Next photo" }).click();
    });

    await test.step("Then the second photo is on and its thumbnail is marked", async () => {
      await expect(page.getByRole("button", { name: "Show photo 2 of 3" })).toHaveAttribute(
        "aria-current",
        "true",
      );
      await expect(page.getByText("Photo 2 of 3")).toBeAttached();
    });

    await test.step("When they tap the last thumbnail", async () => {
      await page.getByRole("button", { name: "Show photo 3 of 3" }).click();
    });

    await test.step("Then the last photo is on and there is no next arrow", async () => {
      await expect(page.getByRole("button", { name: "Show photo 3 of 3" })).toHaveAttribute(
        "aria-current",
        "true",
      );
      await expect(page.getByRole("button", { name: "Next photo" })).toBeDisabled();
    });
  });

  test("Scenario: a shopper filters the catalog by size, sees how many are left and takes the filter off", async ({
    page,
    baseURL,
    isMobile,
    signInWithWorkspace,
    workspaceOf,
  }) => {
    const store =
      await test.step("Given a sock store with sizes, in the default theme", async () => {
        await signInWithWorkspace(page);
        return openStore(await workspaceOf(page), baseURL, sockCatalog);
      });

    await test.step("When the shopper opens all products and picks size L", async () => {
      await page.goto(`${store}/products`);
      await expect(page.getByRole("main").getByRole("status")).toHaveText("3 products");
      if (isMobile) await page.getByRole("button", { name: "Filters" }).click();
      await page.getByRole("group", { name: "Size" }).getByText("L (2)").click();
      if (isMobile) await page.getByRole("button", { name: "See 2 products" }).click();
    });

    await test.step("Then only the socks in L are listed, with the filter on", async () => {
      await expect(page).toHaveURL(/f\.Size=L/);
      await expect(page.getByRole("main").getByRole("status")).toHaveText("2 products");
      await expect(page.getByRole("link", { name: /Dotted socks/ })).toBeVisible();
      await expect(page.getByRole("link", { name: /Plain socks/ })).toBeVisible();
      await expect(page.getByRole("link", { name: /Striped socks/ })).toHaveCount(0);
    });

    await test.step("When they sort by price from high to low", async () => {
      await page.getByLabel("Sort by").selectOption("price-desc");
    });

    await test.step("Then the dearest comes first", async () => {
      await expect(page).toHaveURL(/sort=price-desc/);
      await expect(
        page.getByRole("main").getByRole("link", { name: /socks/ }).first(),
      ).toContainText("Plain socks");
    });

    await test.step("When they take the size filter off", async () => {
      await page.getByRole("link", { name: "Remove filter: Size: L" }).click();
    });

    await test.step("Then the three socks are back", async () => {
      await expect(page.getByRole("main").getByRole("status")).toHaveText("3 products");
    });
  });

  test("Scenario: a wholesale store lists its products with their codes and no filters", async ({
    page,
    baseURL,
    signInWithWorkspace,
    workspaceOf,
  }) => {
    const store = await test.step("Given a store in the Wholesale theme", async () => {
      await signInWithWorkspace(page, "Pacific Seafood");
      const workspace = await workspaceOf(page);
      const address = await openStore(workspace, baseURL, sockCatalog);
      await updateStoreTheme(workspace.tenant, storeThemeSchema.parse({ theme: "wholesale" }));
      return address;
    });

    await test.step("When a buyer opens all products", async () => {
      await page.goto(`${store}/products`);
    });

    await test.step("Then each product shows its code and stock, and there are no filters", async () => {
      await expect(page.getByRole("link", { name: /Dotted socks/ })).toContainText(
        "SKU DOTTEDIn stock",
      );
      await expect(page.getByRole("complementary", { name: "Filters" })).toHaveCount(0);
      await expect(page.getByLabel("Sort by")).toBeVisible();
    });
  });

  test("Scenario: on the phone, Add to cart waits at the bottom of the screen and says when it worked", async ({
    page,
    baseURL,
    isMobile,
    signInWithWorkspace,
    workspaceOf,
  }) => {
    const store = await test.step("Given a store with a mug that has three photos", async () => {
      await signInWithWorkspace(page);
      const workspace = await workspaceOf(page);
      return openStore(workspace, baseURL, await catalogWithCopiedPhoto(workspace, 3));
    });

    await test.step("When the shopper opens the mug", async () => {
      await page.goto(`${store}/products/pura-vida-mug`);
    });

    const button = page.getByRole("button", { name: "Add to cart" });
    await test.step("Then Add to cart is on screen without scrolling, at the bottom on the phone", async () => {
      await expect(button).toBeInViewport();
      const box = await button.boundingBox();
      const height = page.viewportSize()?.height ?? 0;
      if (isMobile) expect(height - (box?.y ?? 0) - (box?.height ?? 0)).toBeLessThan(32);
    });

    await test.step("When they add it", async () => {
      await button.click();
    });

    await test.step("Then it says so right above the button, with the way to the cart", async () => {
      await expect(page.getByRole("status").filter({ hasText: "Added" })).toBeInViewport();
      await expect(page.getByRole("link", { name: "View cart" })).toBeInViewport();
    });
  });

  test("Scenario: the owner turns off the size filter in Design and the catalog stops offering it", async ({
    page,
    baseURL,
    signInWithWorkspace,
    workspaceOf,
  }) => {
    const store = await test.step("Given a sock store in the Boutique theme", async () => {
      await signInWithWorkspace(page);
      const workspace = await workspaceOf(page);
      const address = await openStore(workspace, baseURL, sockCatalog);
      await updateStoreTheme(workspace.tenant, storeThemeSchema.parse({ theme: "boutique" }));
      return address;
    });

    await test.step("When the owner unticks Size in the catalog filters and saves", async () => {
      await openSection(page, "Design");
      await page
        .getByRole("group", { name: "Catalog filters" })
        .getByLabel("Size", { exact: true })
        .uncheck();
      await page.getByRole("button", { name: "Save design" }).click();
      await expect(page.getByRole("main").getByRole("status")).toHaveText(
        "Saved. Your store already looks like this.",
      );
    });

    await test.step("Then the catalog filters by color and price, not by size", async () => {
      await page.goto(`${store}/products`);
      const filters = page.getByRole("complementary", { name: "Filters" });
      if (await page.getByRole("button", { name: "Filters" }).isVisible()) {
        await page.getByRole("button", { name: "Filters" }).click();
      }
      await expect(filters.getByRole("group", { name: "Color" })).toBeVisible();
      await expect(filters.getByRole("group", { name: "Price" })).toBeVisible();
      await expect(filters.getByRole("group", { name: "Size" })).toHaveCount(0);
    });
  });

  test("Scenario: a filter with many values shows a few, finds the rest by name and keeps what was picked", async ({
    page,
    baseURL,
    isMobile,
    signInWithWorkspace,
    workspaceOf,
  }) => {
    const store = await test.step("Given a sock store with twenty designs", async () => {
      await signInWithWorkspace(page);
      const designs = Array.from(
        { length: 20 },
        (_, i) => `Design ${String(i + 1).padStart(2, "0")}`,
      );
      return openStore(await workspaceOf(page), baseURL, {
        ...sockCatalog,
        products: designs.map((design, i) =>
          sock(`sock-${i + 1}`, `Sock ${i + 1}`, 350_000, { Design: [design] }),
        ),
      });
    });

    await test.step("When the shopper opens the catalog's filters", async () => {
      await page.goto(`${store}/products`);
      if (isMobile) await page.getByRole("button", { name: "Filters" }).click();
    });

    const designs = page.getByRole("group", { name: "Design" });
    await test.step("Then Design shows 8 values and offers the other 12", async () => {
      await expect(designs.getByRole("checkbox", { includeHidden: true })).toHaveCount(20);
      await expect(designs.getByText("Design 08")).toBeVisible();
      await expect(designs.getByText("Design 09")).toBeHidden();
      await expect(designs.getByText("See 12 more")).toBeVisible();
    });

    await test.step("When they pick Design 01, then find and pick Design 17", async () => {
      await designs.getByText("Design 01").click();
      await expect(page).toHaveURL(/f\.Design=Design\+01/);
      await designs.getByRole("searchbox", { name: "Find in Design" }).fill("17");
      await designs.getByText("Design 17").click();
    });

    await test.step("Then both stay on", async () => {
      await expect(page).toHaveURL(/f\.Design=Design\+01.*f\.Design=Design\+17/);
      if (isMobile) await page.getByRole("button", { name: "See 2 products" }).click();
      await expect(page.getByRole("main").getByRole("status").first()).toHaveText("2 products");
    });
  });
});
