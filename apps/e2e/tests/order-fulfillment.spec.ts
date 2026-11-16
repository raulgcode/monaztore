import { expect, ownerTest as test } from "../support/fixtures";
import { getEmail, getLinkFromEmail, uniqueEmail } from "../support/mailpit";
import { openStore, placeSampleOrder } from "../support/storefront";

test.describe("Feature: sending an order", () => {
  test("Scenario: the owner confirms a SINPE payment, sends the order with its tracking number and the shopper reads 'On its way' with it", async ({
    page,
    workspace,
    baseURL,
    newVisitor,
  }) => {
    const email = uniqueEmail("sent");
    const { store, number } =
      await test.step("Given a shopper's SINPE order in the owner's store", async () => {
        const store = await openStore(workspace, baseURL);
        const number = await placeSampleOrder(workspace, {
          name: "Ana Mora",
          email,
          reference: "998877",
        });
        return { store, number };
      });

    await test.step("When the owner confirms the payment", async () => {
      await page.goto(`/app/${workspace.slug}/orders/${number}`);
      await page.getByRole("button", { name: "Confirm payment" }).click();
    });

    await test.step("Then the shopper gets an email saying the payment came in", async () => {
      const paid = await getEmail(email, {
        subject: `My company: we confirmed your payment for order #${number}`,
      });
      expect(paid.Text).toContain("Hi, Ana Mora");
      await expect(page.getByText("Not sent yet.")).toBeVisible();
    });

    await test.step("When the owner marks it sent with the courier's tracking number", async () => {
      await page.getByLabel("Tracking number (optional)").fill("RR123456789CR");
      await page.getByRole("button", { name: "Mark as sent" }).click();
    });

    await test.step("Then the order shows the tracking number and the shopper is emailed", async () => {
      await expect(page.getByRole("main").getByRole("status")).toHaveText(
        "Marked as sent. We emailed the customer.",
      );
      await expect(page.getByText("Tracking number: RR123456789CR")).toBeVisible();
      const sent = await getEmail(email, {
        subject: `My company: your order #${number} is on its way`,
      });
      expect(sent.Text).toContain("Tracking number: RR123456789CR");
    });

    await test.step("And the email's link opens the order saying it's on its way", async () => {
      const shopper = await newVisitor();
      await shopper.goto(
        await getLinkFromEmail(email, store, `My company: your order #${number} is on its way`),
      );
      await expect(shopper.getByText("On its way")).toBeVisible();
      await expect(shopper.getByText("Tracking number: RR123456789CR")).toBeVisible();
    });
  });

  test("Scenario: the owner sends a cash order before it's paid and marking it delivered also marks it paid", async ({
    page,
    workspace,
    baseURL,
  }) => {
    const number = await test.step("Given a shopper's order paid on delivery", async () => {
      await openStore(workspace, baseURL);
      return placeSampleOrder(workspace, {
        name: "Luis Solís",
        email: uniqueEmail("cash"),
        paymentMethod: "cash",
      });
    });

    await test.step("When the owner opens it from the orders to send", async () => {
      await page.goto(`/app/${workspace.slug}/orders?status=to_ship`);
      await page.getByRole("link", { name: new RegExp(`${number}.*Luis Solís`) }).click();
    });

    await test.step("Then it says it's paid on delivery and can go out already", async () => {
      await expect(
        page.getByText("Paid on delivery: you get the money when it arrives."),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: "WhatsApp" })).toHaveAttribute(
        "href",
        "https://wa.me/50688880000",
      );
    });

    await test.step("When they mark it sent and then delivered and paid", async () => {
      await page.getByRole("button", { name: "Mark as sent" }).click();
      await expect(page.getByRole("main").getByRole("status")).toHaveText(
        "Marked as sent. We emailed the customer.",
      );
      await page.getByRole("button", { name: "Delivered and paid" }).click();
    });

    await test.step("Then the order is paid and delivered", async () => {
      await expect(page.getByRole("main").getByRole("status")).toHaveText("Marked as delivered.");
      await expect(page.getByText(/^Delivered on /)).toBeVisible();
      await expect(page.getByRole("button", { name: "Confirm payment" })).toHaveCount(0);
    });
  });
});
