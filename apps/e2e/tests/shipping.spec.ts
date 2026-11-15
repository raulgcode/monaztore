import { expect, test } from "../support/fixtures";
import { openStore } from "../support/storefront";

// Its own workspace: the shipping options change every checkout of the worker's shared store.
test.describe("Feature: shipping options", () => {
  test("Scenario: the owner sets a courier and a pickup, and the shopper pays the courier's ₡2,500 or picks up for free without an address", async ({
    page,
    baseURL,
    signInWithWorkspace,
    workspaceOf,
  }) => {
    const store = await test.step("Given an owner with a store open", async () => {
      await signInWithWorkspace(page, "Envios Shop");
      return openStore(await workspaceOf(page), baseURL);
    });

    await test.step("When they add a courier for ₡2,500 and a pickup at the store", async () => {
      await page.goto(`${new URL(page.url()).pathname.match(/^\/app\/[^/]+/)?.[0]}/store`);
      await page.getByRole("button", { name: "Add an option" }).click();
      const courier = page.getByRole("group", { name: "Option 1" });
      await courier.getByLabel("Name shoppers see").fill("Correos de Costa Rica");
      await courier.getByLabel("Price", { exact: true }).fill("2500");
      await page.getByRole("button", { name: "Add an option" }).click();
      const pickup = page.getByRole("group", { name: "Option 2" });
      await pickup.getByLabel("Name shoppers see").fill("Pick up in Heredia");
      await pickup.getByLabel("Price", { exact: true }).fill("0");
      await pickup.getByLabel(/Picked up at the store/).check();
      await page.getByRole("button", { name: "Save shipping" }).click();
    });

    await test.step("Then the store says the shipping was saved", async () => {
      await expect(page.getByText("Shipping saved.")).toBeVisible();
    });

    await test.step("When a shopper checks out a mug with the courier", async () => {
      await page.goto(`${store}/products/pura-vida-mug`);
      await page.getByRole("button", { name: "Add to cart" }).click();
      await expect(page.getByRole("main").getByRole("status")).toContainText("Added to your cart.");
      await page.goto(`${store}/checkout`);
    });

    await test.step("Then the courier comes chosen and the total is the mug plus ₡2,500", async () => {
      await expect(page.getByRole("radio", { name: /Correos de Costa Rica/ })).toBeChecked();
      await expect(page.getByText("Shipping: Correos de Costa Rica")).toBeVisible();
      await expect(page.getByText("₡8,490")).toBeVisible();
    });

    await test.step("When they pick it up at the store instead and order", async () => {
      await page.getByRole("radio", { name: /Pick up in Heredia/ }).check();
      await expect(page.getByLabel("Address", { exact: true })).toBeHidden();
      await page.getByLabel("Email", { exact: true }).fill("ana@example.com");
      await page.getByLabel("Full name").fill("Ana Mora");
      await page.getByLabel("Phone", { exact: true }).fill("8888-0000");
      await page.getByRole("radio", { name: /SINPE Móvil/ }).check();
      await page.getByRole("button", { name: "Place order" }).click();
    });

    await test.step("Then the order costs just the mug and says it's picked up", async () => {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Order #\d+$/);
      await expect(page.getByRole("heading", { name: "Pick it up at the store" })).toBeVisible();
      await expect(page.getByText("Shipping: Pick up in Heredia")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Pay ₡5,990 to finish" })).toBeVisible();
    });
  });
});
