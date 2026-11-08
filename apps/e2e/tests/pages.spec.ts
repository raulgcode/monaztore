import { randomUUID } from "node:crypto";
import { expect, ownerTest as test } from "../support/fixtures";
import { openSection } from "../support/navigation";
import { openStore, requestStore } from "../support/storefront";

test.describe("Feature: the store's own pages", () => {
  test("Scenario: the owner builds a page with blocks, publishes it and a shopper reads it at its address", async ({
    page,
    workspace,
    baseURL,
    newVisitor,
  }) => {
    const id = randomUUID().slice(0, 8);
    const title = `About us ${id}`;
    const store = await test.step("Given the owner's store is open", () =>
      openStore(workspace, baseURL));

    await test.step("When they create a page in Pages", async () => {
      await page.goto(`/app/${workspace.slug}`);
      await openSection(page, "Pages");
      await page.getByRole("button", { name: "New page" }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Edit “New page”");
    });

    await test.step("And give it a title, an address, a heading, a text and a question", async () => {
      await page.getByLabel("Title", { exact: true }).fill(title);
      await page.getByLabel("Address", { exact: true }).fill(`about-us-${id}`);
      await page
        .getByRole("group", { name: "1. Heading" })
        .getByRole("textbox", { name: "Heading" })
        .fill("Our story");
      await page
        .getByRole("group", { name: "2. Text" })
        .getByRole("textbox", { name: "Text" })
        .fill("We make mugs in Cartago.");
      await page.getByRole("button", { name: "Add a block" }).click();
      await page.getByRole("button", { name: /^Questions/ }).click();
      const questions = page.getByRole("group", { name: "3. Questions" });
      await questions.getByLabel("Question 1").fill("Do you ship?");
      await questions.getByLabel("Answer 1").fill("Yes, all over the country.");
    });

    await test.step("Then the preview shows the page as it will look", async () => {
      // On the phone, edit and preview are tabs; from 1024 px they sit side by side.
      const previewTab = page.getByRole("tab", { name: "Preview" });
      if (await previewTab.isVisible()) await previewTab.click();
      const preview = page.getByRole("region", { name: "Preview" });
      await expect(preview.getByRole("heading", { name: "Our story" })).toBeVisible();
      await expect(preview.getByText("We make mugs in Cartago.")).toBeVisible();
      const editTab = page.getByRole("tab", { name: "Edit" });
      if (await editTab.isVisible()) await editTab.click();
    });

    await test.step("When they publish it", async () => {
      await page.getByRole("button", { name: "Publish" }).click();
      await expect(page.getByRole("main").getByRole("status").last()).toHaveText(
        new RegExp(`^Published\\. It's at .*/about-us-${id}$`),
      );
    });

    await test.step("Then a shopper opens it at its address and opens the question", async () => {
      const shopper = await newVisitor();
      await shopper.goto(`${store}/about-us-${id}`);
      await expect(shopper.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(shopper.getByRole("heading", { name: "Our story" })).toBeVisible();
      await shopper.getByText("Do you ship?").click();
      await expect(shopper.getByText("Yes, all over the country.")).toBeVisible();
      await expect(
        shopper.getByRole("contentinfo").getByRole("link", { name: title }),
      ).toBeVisible();
    });
  });

  test("Scenario: a draft page answers 404 to shoppers until it is published", async ({
    page,
    workspace,
    baseURL,
  }) => {
    const store = await test.step("Given the owner's store is open", () =>
      openStore(workspace, baseURL));

    await test.step("When the owner starts a new page and doesn't publish it", async () => {
      await page.goto(`/app/${workspace.slug}/pages`);
      await page.getByRole("button", { name: "New page" }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Edit “New page”");
    });

    await test.step("Then the list says it is a draft and its address answers 404", async () => {
      const address = await page.getByLabel("Address", { exact: true }).inputValue();
      expect(address).toMatch(/^new-page(-\d+)?$/);
      await page.getByRole("link", { name: "All pages" }).click();
      await expect(page.getByRole("link").filter({ hasText: `/${address} ·` })).toContainText(
        "Draft",
      );
      expect((await requestStore(page.request, store, `/${address}`)).status()).toBe(404);
    });
  });

  test("Scenario: a migrated page's old address moves for good to its new one", async ({
    page,
    workspace,
    baseURL,
  }) => {
    const store =
      await test.step("Given a store migrated with its page /preguntas-frecuentes/", () =>
        openStore(workspace, baseURL));

    const response = await test.step("When a shopper follows the old link", () =>
      requestStore(page.request, store, "/preguntas-frecuentes/", { maxRedirects: 0 }));

    await test.step("Then it answers 301 to the page's new address", async () => {
      expect(response.status()).toBe(301);
      expect(response.headers().location).toBe("/questions");
    });
  });
});
