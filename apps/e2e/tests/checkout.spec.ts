import { expect, ownerTest as test } from "../support/fixtures";
import { openStore } from "../support/storefront";

test.describe("Feature: buying with SINPE Móvil", () => {
  test("Scenario: a shopper adds the mug twice, orders with SINPE and sends the payment's reference", async ({
    page,
    workspace,
    baseURL,
  }) => {
    const store = await test.step("Given a store that takes SINPE Móvil", () =>
      openStore(workspace, baseURL));

    await test.step("When the shopper adds the mug to the cart twice", async () => {
      await page.goto(`${store}/products/pura-vida-mug`);
      for (const _ of [1, 2]) {
        await page.getByRole("button", { name: "Add to cart" }).click();
        await expect(page.getByRole("main").getByRole("status")).toHaveText(
          "Added to your cart.View cart",
        );
      }
    });

    await test.step("Then the cart has 2 mugs for ₡11,980", async () => {
      await page.getByRole("link", { name: "Cart, 2 items" }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cart");
      await expect(page.getByRole("main").getByText("₡11,980")).toHaveCount(2);
    });

    await test.step("When they check out with their details and SINPE Móvil", async () => {
      await page.getByRole("link", { name: "Checkout" }).click();
      await page.getByLabel("Email", { exact: true }).fill("ana@example.com");
      await page.getByLabel("Full name").fill("Ana Mora");
      await page.getByLabel("Phone", { exact: true }).fill("8888-0000");
      await page.getByLabel("Address", { exact: true }).fill("100 m norte del parque");
      await page.getByLabel("City or town").fill("Heredia");
      await page.getByLabel("Province").fill("Heredia");
      await page.getByRole("radio", { name: /SINPE Móvil/ }).check();
      await page.getByRole("button", { name: "Place order" }).click();
    });

    await test.step("Then the order page says where to pay and the cart is empty", async () => {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Order #\d+$/);
      await expect(page.getByRole("main").getByRole("status")).toHaveText(
        "Waiting for your payment",
      );
      await expect(page.getByText("SINPE Móvil to 8888-1234 (My company S.A.).")).toBeVisible();
      await expect(page.getByRole("link", { name: "Cart, 0 items" })).toBeVisible();
    });

    await test.step("When they send the reference of their payment", async () => {
      await page.getByLabel("Payment reference number").fill("202611080001");
      await page.getByRole("button", { name: "I already paid" }).click();
    });

    await test.step("Then the order says the store is checking the payment", async () => {
      await expect(page.getByRole("main").getByRole("status")).toHaveText(
        "Payment sent: the store is checking it",
      );
      await expect(page.getByText("Reference you sent: 202611080001")).toBeVisible();
    });
  });

  test("Scenario: checking out without the details says what is missing and places no order", async ({
    page,
    workspace,
    baseURL,
  }) => {
    const store = await openStore(workspace, baseURL);
    await page.goto(`${store}/products/pura-vida-mug`);
    await page.getByRole("button", { name: "Add to cart" }).click();
    await expect(page.getByRole("main").getByRole("status")).toContainText("Added to your cart.");

    await page.goto(`${store}/checkout`);
    await page.getByRole("button", { name: "Place order" }).click();

    await expect(page.getByText("Enter your email")).toBeVisible();
    await expect(page.getByText("Enter a phone number we can reach you at")).toBeVisible();
    await expect(page).toHaveURL(`${store}/checkout`);
  });
});
