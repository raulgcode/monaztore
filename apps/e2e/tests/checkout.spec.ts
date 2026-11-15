import { updateStorePayments } from "@monaztore/core";
import { eq, schema } from "@monaztore/db";
import { expect, ownerTest as test } from "../support/fixtures";
import { getEmail, uniqueEmail } from "../support/mailpit";
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

  test("Scenario: the shopper gets their order by email with how to pay, and the owner hears of it and of the payment", async ({
    page,
    workspace,
    baseURL,
    db,
  }) => {
    const store = await test.step("Given a store that takes SINPE Móvil", () =>
      openStore(workspace, baseURL));
    const shopper = uniqueEmail("shopper");

    const number = await test.step("When a shopper orders a mug with SINPE Móvil", async () => {
      await page.goto(`${store}/products/pura-vida-mug`);
      await page.getByRole("button", { name: "Add to cart" }).click();
      await expect(page.getByRole("main").getByRole("status")).toContainText("Added to your cart.");
      await page.goto(`${store}/checkout`);
      await page.getByLabel("Email", { exact: true }).fill(shopper);
      await page.getByLabel("Full name").fill("Ana Mora");
      await page.getByLabel("Phone", { exact: true }).fill("8888-0000");
      await page.getByLabel("Address", { exact: true }).fill("100 m norte del parque");
      await page.getByLabel("City or town").fill("Heredia");
      await page.getByLabel("Province").fill("Heredia");
      await page.getByRole("radio", { name: /SINPE Móvil/ }).check();
      await page.getByRole("button", { name: "Place order" }).click();
      const heading = page.getByRole("heading", { level: 1 });
      await expect(heading).toHaveText(/^Order #\d+$/);
      return (await heading.textContent())?.replace("Order #", "") ?? "";
    });
    const orderPage = page.url();

    await test.step("Then the shopper's email has the mug, the total, where to pay and the order's link", async () => {
      const email = await getEmail(shopper, {
        subject: `My company: we got your order #${number}`,
      });
      expect(email.Text).toContain("Pura Vida mug × 1: ₡5,990");
      expect(email.Text).toContain("Total: ₡5,990");
      expect(email.Text).toContain("SINPE Móvil to 8888-1234, in the name of My company S.A.");
      expect(email.Text).toContain(orderPage);
    });

    const [owner] = await db
      .select({ email: schema.user.email })
      .from(schema.user)
      .where(eq(schema.user.id, workspace.tenant.userId));
    const ownerEmail = owner?.email ?? "";

    await test.step("And the owner is told who ordered and for how much", async () => {
      const email = await getEmail(ownerEmail, { subject: `My company: new order #${number}` });
      expect(email.Text).toContain(`Ana Mora (${shopper}) placed an order for ₡5,990:`);
      expect(email.Text).toContain(`/app/${workspace.slug}/orders/${number}`);
    });

    await test.step("When the shopper sends the reference of their payment", async () => {
      await page.getByLabel("Payment reference number").fill("202611150001");
      await page.getByRole("button", { name: "I already paid" }).click();
      await expect(page.getByText("Reference you sent: 202611150001")).toBeVisible();
    });

    await test.step("Then the owner is asked to check the payment", async () => {
      const email = await getEmail(ownerEmail, {
        subject: `My company: order #${number} says it's paid`,
      });
      expect(email.Text).toContain(
        "Ana Mora sent the payment of ₡5,990 with the reference 202611150001.",
      );
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

  test("Scenario: a shopper pays on delivery and the order says to pay ₡5,990 when it arrives, with no reference to send", async ({
    page,
    workspace,
    baseURL,
  }) => {
    const store = await test.step("Given a store that takes cash on delivery", async () => {
      const store = await openStore(workspace, baseURL);
      await updateStorePayments(workspace.tenant, {
        sinpe: { enabled: true, phone: "8888-1234", holder: "My company S.A." },
        cash: { enabled: true, note: "Cash or SINPE Móvil to the courier." },
      });
      return store;
    });

    await test.step("When a shopper orders a mug paying on delivery", async () => {
      await page.goto(`${store}/products/pura-vida-mug`);
      await page.getByRole("button", { name: "Add to cart" }).click();
      await expect(page.getByRole("main").getByRole("status")).toContainText("Added to your cart.");
      await page.goto(`${store}/checkout`);
      await page.getByLabel("Email", { exact: true }).fill("ana@example.com");
      await page.getByLabel("Full name").fill("Ana Mora");
      await page.getByLabel("Phone", { exact: true }).fill("8888-0000");
      await page.getByLabel("Address", { exact: true }).fill("100 m norte del parque");
      await page.getByLabel("City or town").fill("Heredia");
      await page.getByLabel("Province").fill("Heredia");
      await page.getByRole("radio", { name: /Cash on delivery/ }).check();
      await page.getByRole("button", { name: "Place order" }).click();
    });

    await test.step("Then the order says to pay when it arrives and asks for no reference", async () => {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Order #\d+$/);
      await expect(page.getByRole("heading", { name: "Pay ₡5,990 when it arrives" })).toBeVisible();
      await expect(page.getByText("Cash or SINPE Móvil to the courier.")).toBeVisible();
      await expect(page.getByLabel("Payment reference number")).toHaveCount(0);
    });
  });
});
