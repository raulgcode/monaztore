import { randomUUID } from "node:crypto";
import type { ImportedCatalog, ImportedProduct } from "@monaztore/contracts";
import { storeThemeSchema } from "@monaztore/contracts";
import { updateStoreTheme } from "@monaztore/core";
import { expect, test } from "../support/fixtures";
import { openSection } from "../support/navigation";
import { openStore } from "../support/storefront";

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
  test("Scenario: the owner picks the Boutique theme with an announcement and the store shows it", async ({
    page,
    baseURL,
    signInWithWorkspace,
    workspaceOf,
  }) => {
    const store = await test.step("Given an owner with a store on its own domain", async () => {
      await signInWithWorkspace(page, "Super Socks");
      return openStore(await workspaceOf(page), baseURL, sockCatalog);
    });

    await test.step("When they pick Boutique, a title and an announcement in Design and save", async () => {
      await openSection(page, "Design");
      await page.getByText("Boutique", { exact: true }).click();
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
});
