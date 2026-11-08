import { randomUUID } from "node:crypto";
import { expect, ownerTest as test } from "../support/fixtures";
import { openSection } from "../support/navigation";
import { placeSampleOrder } from "../support/storefront";

const shopper = () => `Ana ${randomUUID().slice(0, 8)}`;

test.describe("Feature: checking a store's orders", () => {
  test("Scenario: the owner finds a payment to check, confirms it and the order shows as paid", async ({
    page,
    workspace,
  }) => {
    const name = shopper();
    const number = await test.step("Given a shopper ordered and sent their SINPE reference", () =>
      placeSampleOrder(workspace, { name, reference: "202611080001" }));

    await test.step("When the owner opens Orders and shows the ones to check", async () => {
      await page.goto(`/app/${workspace.slug}`);
      await openSection(page, "Orders");
      await page.getByRole("link", { name: "To check", exact: true }).click();
    });

    await test.step("Then the order is there, waiting for the store", async () => {
      const row = page.getByRole("link", { name: new RegExp(`#${number} · ${name}`) });
      await expect(row).toContainText("Payment to check");
      await expect(row).toContainText("₡5,990");
      await row.click();
    });

    await test.step("When they open it and confirm the payment", async () => {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Order #${number}`);
      await expect(page.getByText("Reference: 202611080001")).toBeVisible();
      await page.getByRole("button", { name: "Confirm payment" }).click();
    });

    await test.step("Then the order says it is paid and can't be confirmed again", async () => {
      await expect(page.getByRole("main").getByRole("status")).toHaveText("Payment confirmed.");
      await expect(page.getByRole("main").getByText("Paid", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Confirm payment" })).toHaveCount(0);
    });
  });

  test("Scenario: the owner cancels an unpaid order and it shows as cancelled", async ({
    page,
    workspace,
  }) => {
    const name = shopper();
    const number = await placeSampleOrder(workspace, { name });

    await page.goto(`/app/${workspace.slug}/orders?status=pending_payment`);
    await page.getByRole("link", { name: new RegExp(`#${number} · ${name}`) }).click();
    await expect(page.getByText("The shopper hasn't sent a reference yet.")).toBeVisible();
    await page.getByRole("button", { name: "Cancel order" }).click();

    await expect(page.getByRole("main").getByRole("status")).toHaveText("Order cancelled.");
    await expect(page.getByRole("main").getByText("Cancelled", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "All orders" }).click();
    await page.getByRole("link", { name: "Cancelled", exact: true }).click();
    await expect(
      page.getByRole("link", { name: new RegExp(`#${number} · ${name}`) }),
    ).toContainText("Cancelled");
  });
});
