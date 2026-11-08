import { randomUUID } from "node:crypto";
import { addStoreDomain } from "@monaztore/core";
import { expect, ownerTest as test } from "../support/fixtures";
import { openSection } from "../support/navigation";

test.describe("Feature: the store's domains and payments", () => {
  test("Scenario: the owner connects a domain and makes it the store's main one", async ({
    page,
    workspace,
  }) => {
    const hostname = `shop-${randomUUID().slice(0, 8)}.example.com`;
    await test.step("Given the store already answers on another domain", () =>
      addStoreDomain(workspace.tenant, `old-${randomUUID().slice(0, 8)}.example.com`, {
        primary: true,
      }));

    await test.step("When the owner adds a domain in Store", async () => {
      await page.goto(`/app/${workspace.slug}`);
      await openSection(page, "Store");
      await page.getByLabel("Domain", { exact: true }).fill(hostname);
      await page.getByRole("button", { name: "Add domain" }).click();
    });

    await test.step("Then the domain is listed", async () => {
      await expect(page.getByRole("main").getByRole("status")).toHaveText("Domain added.");
      await expect(
        page.getByRole("main").getByRole("listitem").filter({ hasText: hostname }),
      ).toHaveText(`${hostname}Make main×`);
    });

    await test.step("When they make it the main one", async () => {
      await page
        .getByRole("main")
        .getByRole("listitem")
        .filter({ hasText: hostname })
        .getByRole("button", { name: "Make main" })
        .click();
    });

    await test.step("Then it is first, marked as main", async () => {
      await expect(page.getByRole("main").getByRole("listitem").first()).toHaveText(
        `${hostname}Main×`,
      );
      await expect(page.getByRole("main").getByText("Main", { exact: true })).toHaveCount(1);
    });
  });

  test("Scenario: a transfer without a valid IBAN isn't saved, and with one it is", async ({
    page,
    workspace,
  }) => {
    await page.goto(`/app/${workspace.slug}/store`);
    const transfer = page.getByRole("group", { name: "Take bank transfers" });
    await transfer.getByRole("checkbox", { name: "Take bank transfers" }).check();
    await transfer.getByLabel("Bank", { exact: true }).fill("Banco Nacional");
    await transfer.getByLabel("IBAN").fill("12345");
    await transfer.getByLabel("In the name of").fill("My company S.A.");
    await page.getByRole("button", { name: "Save payments" }).click();

    await expect(page.getByText("Enter a valid IBAN, like CR05015202001026284066")).toBeVisible();

    await page.getByLabel("IBAN").fill("CR05 0152 0200 1026 2840 66");
    await page.getByRole("button", { name: "Save payments" }).click();

    await expect(page.getByRole("main").getByRole("status")).toHaveText("Payments saved.");
    await page.reload();
    await expect(page.getByLabel("IBAN")).toHaveValue("CR05015202001026284066");
  });
});
