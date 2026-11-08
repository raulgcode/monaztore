import { expect, test } from "../support/fixtures";
import { openSection } from "../support/navigation";
import { openStore } from "../support/storefront";

test.describe("Feature: the store's language", () => {
  test("Scenario: a new store speaks Spanish whatever the browser's language, and a shopper switches to English at its foot", async ({
    page,
    baseURL,
    signInWithWorkspace,
    workspaceOf,
  }) => {
    const store =
      await test.step("Given a store whose owner hasn't picked a language", async () => {
        await signInWithWorkspace(page);
        return openStore(await workspaceOf(page), baseURL, undefined, { locale: null });
      });

    await test.step("When a shopper whose browser is in English opens its catalog", async () => {
      await page.goto(`${store}/products`);
    });

    await test.step("Then the store is in Spanish", async () => {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Todos los productos");
      await expect(page.getByLabel("Ordenar por")).toBeVisible();
    });

    await test.step("When they pick English at the foot of the store", async () => {
      await page.getByRole("button", { name: "English" }).click();
    });

    await test.step("Then the same page comes back in English, and stays so", async () => {
      await expect(page).toHaveURL(`${store}/products`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("All products");
      await page.reload();
      await expect(page.getByLabel("Sort by")).toBeVisible();
    });
  });

  test("Scenario: the owner puts the store in English and shoppers see it in English", async ({
    page,
    baseURL,
    newVisitor,
    signInWithWorkspace,
    workspaceOf,
  }) => {
    const store = await test.step("Given a store in Spanish", async () => {
      await signInWithWorkspace(page);
      return openStore(await workspaceOf(page), baseURL, undefined, { locale: "es" });
    });

    await test.step("When the owner picks English as the store's language", async () => {
      await openSection(page, "Store");
      await page.getByText("English", { exact: true }).click();
      await page.getByRole("button", { name: "Save language" }).click();
    });

    await test.step("Then it is saved", async () => {
      await expect(page.getByRole("main").getByRole("status")).toHaveText(
        "Saved. Your store already speaks this language.",
      );
    });

    await test.step("And a shopper sees the store in English", async () => {
      const shopper = await newVisitor({ locale: "es-CR" });
      await shopper.goto(`${store}/products`);
      await expect(shopper.getByRole("heading", { level: 1 })).toHaveText("All products");
    });
  });
});
