import { readFile } from "node:fs/promises";
import { expect, ownerTest as test } from "../support/fixtures";
import { getLinkFromEmail, uniqueEmail } from "../support/mailpit";
import { openSection } from "../support/navigation";
import { ebookContents, openStore, sellEbook } from "../support/storefront";

test.describe("Feature: selling digital products", () => {
  test("Scenario: the owner puts an e-book on sale with its file and shoppers see it's a download", async ({
    page,
    workspace,
    baseURL,
  }) => {
    const store = await test.step("Given the owner's store is open", () =>
      openStore(workspace, baseURL));

    await test.step("When they open Store, then Digital products, and create one", async () => {
      await page.goto(`/app/${workspace.slug}`);
      await openSection(page, "Store");
      await page.getByRole("link", { name: /Digital products/ }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Digital products");
      await page.getByRole("link", { name: "New digital product" }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("New digital product");
      await page.getByLabel("Name", { exact: true }).fill("Latte art guide");
      await page.getByLabel("Price (CRC)").fill("4500");
      await page.getByLabel("File they download").setInputFiles({
        name: "Latte art.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.7 latte"),
      });
      await expect(page.getByLabel("Downloads per file")).toHaveValue("5");
      await expect(page.getByLabel("Days to download")).toHaveValue("30");
      await page.getByRole("button", { name: "Put it on sale" }).click();
    });

    await test.step("Then it's on sale with its file", async () => {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Latte art guide");
      await expect(page.getByRole("main").getByRole("status")).toHaveText(
        "It's on sale. Shoppers download the file once you confirm their payment.",
      );
      await expect(page.getByText("Latte art.pdf")).toBeVisible();
    });

    await test.step("And its page in the store says it's a download", async () => {
      await page.goto(`${store}/products/latte-art-guide`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Latte art guide");
      await expect(
        page.getByText(
          "Digital download: you get the file as soon as the store confirms your payment.",
        ),
      ).toBeVisible();
    });
  });

  test("Scenario: a shopper buys the e-book without an address and downloads it once the store confirms the payment", async ({
    page,
    workspace,
    baseURL,
    newVisitor,
  }) => {
    const email = uniqueEmail("reader");
    const { store, slug } = await test.step("Given a store that sells an e-book", async () => {
      const store = await openStore(workspace, baseURL);
      return { store, ...(await sellEbook(workspace)) };
    });

    const shopper = await newVisitor();
    const orderUrl = await test.step("When a shopper buys it, giving no address", async () => {
      await shopper.goto(`${store}/products/${slug}`);
      await shopper.getByRole("button", { name: "Add to cart" }).click();
      await expect(shopper.getByRole("main").getByRole("status")).toContainText("Added");
      await shopper.goto(`${store}/checkout`);
      await expect(
        shopper.getByText(/^Nothing to ship: you'll download what you bought/),
      ).toBeVisible();
      await expect(shopper.getByLabel("Address", { exact: true })).toHaveCount(0);
      await shopper.getByLabel("Email", { exact: true }).fill(email);
      await shopper.getByLabel("Full name").fill("Ana Mora");
      await shopper.getByLabel("Phone", { exact: true }).fill("8888-0000");
      await shopper.getByRole("radio", { name: /SINPE Móvil/ }).check();
      await shopper.getByRole("button", { name: "Place order" }).click();
      await expect(shopper.getByRole("heading", { level: 1 })).toHaveText(/^Order #\d+$/);
      return shopper.url();
    });

    const number =
      await test.step("Then the order says the files come once the payment is confirmed", async () => {
        await expect(
          shopper.getByText(
            "Your files will be here as soon as the store confirms your payment. We'll also email you the link.",
          ),
        ).toBeVisible();
        await expect(shopper.getByRole("link", { name: /^Download/ })).toHaveCount(0);
        await expect(shopper.getByRole("heading", { name: "Delivery to" })).toHaveCount(0);
        return (await shopper.getByRole("heading", { level: 1 }).textContent())?.replace(/\D/g, "");
      });

    await test.step("When the owner confirms the payment", async () => {
      await page.goto(`/app/${workspace.slug}/orders/${number}`);
      await expect(page.getByText("Digital products only: nothing to ship.")).toBeVisible();
      await page.getByRole("button", { name: "Confirm payment" }).click();
    });

    await test.step("Then the shopper gets the download link by email", async () => {
      await expect(page.getByRole("main").getByRole("status")).toHaveText(
        `Payment confirmed. We emailed the download link to ${email}.`,
      );
      await expect(page.getByText("Brewing handbook.pdf: 0 of 5 downloads")).toBeVisible();
    });

    await test.step("And downloads the PDF from the email's page", async () => {
      await shopper.goto(await getLinkFromEmail(email, store));
      await expect(shopper.getByRole("heading", { level: 1 })).toHaveText(
        `Downloads of order #${number}`,
      );
      await expect(shopper.getByText(/5 downloads left until/)).toBeVisible();
      const [download] = await Promise.all([
        shopper.waitForEvent("download"),
        shopper.getByRole("link", { name: "Download Brewing handbook.pdf" }).click(),
      ]);
      expect(download.suggestedFilename()).toBe("Brewing handbook.pdf");
      expect(await readFile(await download.path(), "utf8")).toBe(ebookContents);
    });

    await test.step("And the order's page has it too, with one download less", async () => {
      await shopper.goto(orderUrl);
      await expect(shopper.getByRole("heading", { name: "Your downloads" })).toBeVisible();
      await expect(shopper.getByText(/4 downloads left until/)).toBeVisible();
      await expect(
        shopper.getByRole("link", { name: "Download Brewing handbook.pdf" }),
      ).toBeVisible();
    });
  });

  test("Scenario: a file downloaded as many times as it allows says so instead of downloading", async ({
    page,
    workspace,
    baseURL,
    newVisitor,
  }) => {
    const email = uniqueEmail("reader");
    const store = await openStore(workspace, baseURL);
    const { slug } = await sellEbook(workspace, { downloadLimit: 1 });
    const shopper = await newVisitor();
    await shopper.goto(`${store}/products/${slug}`);
    await shopper.getByRole("button", { name: "Add to cart" }).click();
    await expect(shopper.getByRole("main").getByRole("status")).toContainText("Added");
    await shopper.goto(`${store}/checkout`);
    await shopper.getByLabel("Email", { exact: true }).fill(email);
    await shopper.getByLabel("Full name").fill("Ana Mora");
    await shopper.getByLabel("Phone", { exact: true }).fill("8888-0000");
    await shopper.getByRole("button", { name: "Place order" }).click();
    await expect(shopper.getByRole("heading", { level: 1 })).toHaveText(/^Order #\d+$/);
    const number = (await shopper.getByRole("heading", { level: 1 }).textContent())?.replace(
      /\D/g,
      "",
    );
    await page.goto(`/app/${workspace.slug}/orders/${number}`);
    await page.getByRole("button", { name: "Confirm payment" }).click();
    await expect(page.getByRole("main").getByRole("status")).toHaveText(
      `Payment confirmed. We emailed the download link to ${email}.`,
    );
    await expect(page.getByText("Brewing handbook.pdf: 0 of 1 downloads")).toBeVisible();

    await shopper.reload();
    const fileUrl = await shopper
      .getByRole("link", { name: "Download Brewing handbook.pdf" })
      .getAttribute("href");
    const [download] = await Promise.all([
      shopper.waitForEvent("download"),
      shopper.getByRole("link", { name: "Download Brewing handbook.pdf" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("Brewing handbook.pdf");

    await shopper.goto(`${store}${fileUrl}`);
    await expect(shopper.getByRole("alert")).toHaveText(
      "You already downloaded this file as many times as it allows. Write to the store if you need it again.",
    );
    await expect(shopper.getByText("No downloads left")).toBeVisible();
    await expect(shopper.getByRole("link", { name: "Download Brewing handbook.pdf" })).toHaveCount(
      0,
    );
  });
});
