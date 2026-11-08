import { randomUUID } from "node:crypto";
import { expect, ownerTest as test } from "../support/fixtures";
import { openSection } from "../support/navigation";
import { openStore } from "../support/storefront";

// An 8 × 8 red PNG: what a phone's photo is, only smaller.
const photo = {
  name: "shirt.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM44OCAFTEMLQkAYplQATyfsGkAAAAASUVORK5CYII=",
    "base64",
  ),
};

test.describe("Feature: the store's products", () => {
  test("Scenario: the owner creates a shirt with a photo, an offer and two sizes, and a shopper sees it on sale with only the size in stock", async ({
    page,
    workspace,
    baseURL,
    newVisitor,
  }) => {
    const id = randomUUID().slice(0, 8);
    const name = `Linen shirt ${id}`;
    const store = await test.step("Given the owner's store is open", () =>
      openStore(workspace, baseURL));

    await test.step("When they start a new product in Products", async () => {
      await page.goto(`/app/${workspace.slug}`);
      await openSection(page, "Products");
      await page.getByRole("link", { name: "New product" }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("New product");
    });

    await test.step("And give it a name, a photo and a price of ₡20,000 on offer at ₡15,000", async () => {
      await page.getByLabel("Name", { exact: true }).fill(name);
      await page.getByLabel("Add photos").setInputFiles(photo);
      await expect(
        page.getByRole("region", { name: "Photos" }).getByText("Cover", { exact: true }),
      ).toBeVisible();
      const price = page.getByRole("region", { name: "Price" });
      await price.getByLabel("Price (CRC)", { exact: true }).fill("20000");
      await price.getByLabel("Offer price (CRC)").fill("15000");
      await expect(price.getByText("25% off: sells at ₡15,000.")).toBeVisible();
    });

    await test.step("And sizes S and M the shopper chooses, with 3 of S and none of M", async () => {
      const stock = page.getByRole("region", { name: "Stock" });
      await stock.getByLabel("Count the stock").check();
      await page.getByRole("button", { name: "Add an option or detail" }).click();
      const attribute = page.getByRole("group", { name: "No name" });
      await attribute.getByRole("combobox", { name: "Name" }).fill("Size");
      const size = page.getByRole("group", { name: "Size" });
      await size.getByLabel("Values").fill("S, M,");
      await size.getByLabel("The shopper chooses it").check();
      await expect(page.getByRole("heading", { name: "2 options" })).toBeVisible();
      const row = (title: string) =>
        page
          .getByRole("listitem")
          .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
      await row("S").getByLabel("How many you have").fill("3");
      await row("M").getByLabel("How many you have").fill("0");
    });

    await test.step("And publish it", async () => {
      await page.getByRole("button", { name: "Publish" }).click();
      await expect(page.getByRole("main").getByRole("status").first()).toHaveText(
        "Product created. Keep filling it in or publish it when it's ready.",
      );
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    });

    await test.step("Then the list shows it published and on offer", async () => {
      await page.getByRole("link", { name: "All products" }).click();
      await page.getByLabel("Search products").fill(id);
      await page.getByLabel("Search products").press("Enter");
      const item = page.getByRole("main").getByRole("listitem").filter({ hasText: name });
      await expect(item).toContainText("On offer");
      await expect(item).toContainText("From ₡15,000");
      await expect(item).toContainText("3 in stock");
    });

    await test.step("And a shopper sees it at ₡15,000 instead of ₡20,000, with only S to buy", async () => {
      const shopper = await newVisitor();
      await shopper.goto(`${store}/products/linen-shirt-${id}`);
      await expect(shopper.getByRole("heading", { level: 1 })).toHaveText(name);
      await expect(shopper.getByRole("main").getByText("₡15,000").first()).toBeVisible();
      await expect(shopper.getByText("Regular price ₡20,000").first()).toBeVisible();
      const sizes = shopper.getByRole("combobox", { name: "Size" });
      await expect(sizes.getByRole("option", { name: /^S/ })).toBeEnabled();
      await expect(sizes.getByRole("option", { name: /^M/ })).toBeDisabled();
    });
  });

  test("Scenario: the owner puts two products on offer at 20% from the list and then hides them", async ({
    page,
    workspace,
    baseURL,
  }) => {
    const id = randomUUID().slice(0, 8);
    await openStore(workspace, baseURL);
    await test.step("Given two new products at ₡10,000", async () => {
      for (const name of [`Cap ${id}`, `Scarf ${id}`]) {
        await page.goto(`/app/${workspace.slug}/products/new`);
        await page.getByLabel("Name", { exact: true }).fill(name);
        await page
          .getByRole("region", { name: "Price" })
          .getByLabel("Price (CRC)", { exact: true })
          .fill("10000");
        await page.getByRole("button", { name: "Publish" }).click();
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
      }
    });

    await test.step("When the owner selects both in the list and puts them on offer at 20%", async () => {
      await page.goto(`/app/${workspace.slug}/products?q=${id}`);
      await page.getByLabel(`Select “Cap ${id}”`).check();
      await page.getByLabel(`Select “Scarf ${id}”`).check();
      const bulk = page.getByRole("form", { name: "Change the selected products" });
      await expect(bulk).toContainText("2 selected");
      await bulk.getByLabel("What to do").selectOption({ label: "Put on offer" });
      await bulk.getByLabel("Discount (%)").fill("20");
      await bulk.getByRole("button", { name: "Apply" }).click();
    });

    await test.step("Then both sell at ₡8,000 on offer", async () => {
      await expect(page.getByRole("main").getByRole("status").first()).toHaveText(
        "2 products changed their offer.",
      );
      const items = page.getByRole("main").getByRole("listitem").filter({ hasText: id });
      await expect(items).toHaveCount(2);
      for (const item of await items.all()) {
        await expect(item).toContainText("On offer");
        await expect(item).toContainText("₡8,000");
      }
    });

    await test.step("When they select the page and hide the products", async () => {
      await page.getByLabel("Select all on this page").check();
      const bulk = page.getByRole("form", { name: "Change the selected products" });
      await bulk.getByLabel("What to do").selectOption({ label: "Hide" });
      await bulk.getByRole("button", { name: "Apply" }).click();
    });

    await test.step("Then the published ones list no longer has them", async () => {
      await expect(page.getByRole("main").getByRole("status").first()).toHaveText(
        "2 products hidden.",
      );
      await page.getByRole("link", { name: /^Published/ }).click();
      await expect(
        page.getByRole("main").getByText("No product matches.", { exact: false }),
      ).toBeVisible();
    });
  });
});

test.describe("Feature: discount coupons", () => {
  test("Scenario: the owner creates a 10% coupon and a shopper pays ₡10,782 for two mugs with it", async ({
    page,
    workspace,
    baseURL,
    newVisitor,
  }) => {
    const code = `MUG${randomUUID().slice(0, 6).toUpperCase()}`;
    const store = await test.step("Given the owner's store is open", () =>
      openStore(workspace, baseURL));

    await test.step("When they create the coupon in Products → Coupons", async () => {
      await page.goto(`/app/${workspace.slug}/products`);
      await page.getByRole("link", { name: "Coupons" }).click();
      await page.getByRole("link", { name: "New coupon" }).click();
      await page.getByRole("textbox", { name: "Code" }).fill(code);
      await page.getByLabel("Percentage off").fill("10");
      await page.getByRole("button", { name: "Create coupon" }).click();
    });

    await test.step("Then the list shows it on, at 10% off", async () => {
      await expect(page.getByRole("main").getByRole("status").first()).toHaveText(
        `Coupon ${code} saved.`,
      );
      const item = page.getByRole("main").getByRole("listitem").filter({ hasText: code });
      await expect(item).toContainText("On");
      await expect(item).toContainText("10% off");
      await expect(item.getByRole("switch", { name: `Coupon ${code} on` })).toBeChecked();
    });

    const shopper = await newVisitor();
    await test.step("When a shopper puts two mugs in the cart and types the code", async () => {
      await shopper.goto(`${store}/products/pura-vida-mug`);
      for (const _ of [1, 2]) {
        await shopper.getByRole("button", { name: "Add to cart" }).click();
        await expect(shopper.getByRole("main").getByRole("status")).toContainText(
          "Added to your cart.",
        );
      }
      await shopper.goto(`${store}/cart`);
      await shopper.getByText("Have a discount code?").click();
      await shopper.getByLabel("Discount code").fill(code.toLowerCase());
      await shopper.getByRole("button", { name: "Apply" }).click();
    });

    await test.step("Then the cart takes ₡1,198 off the ₡11,980", async () => {
      await expect(shopper.getByText(`Discount (${code})`)).toBeVisible();
      await expect(shopper.getByText("−₡1,198")).toBeVisible();
      await expect(shopper.getByText("₡10,782")).toBeVisible();
    });

    await test.step("When they place the order", async () => {
      await shopper.getByRole("link", { name: "Checkout" }).click();
      await expect(shopper.getByText("−₡1,198")).toBeVisible();
      await shopper.getByLabel("Email", { exact: true }).fill("ana@example.com");
      await shopper.getByLabel("Full name").fill("Ana Mora");
      await shopper.getByLabel("Phone", { exact: true }).fill("8888-0000");
      await shopper.getByLabel("Address", { exact: true }).fill("100 m norte del parque");
      await shopper.getByLabel("City or town").fill("Heredia");
      await shopper.getByLabel("Province").fill("Heredia");
      await shopper.getByRole("radio", { name: /SINPE Móvil/ }).check();
      await shopper.getByRole("button", { name: "Place order" }).click();
    });

    await test.step("Then the order asks for ₡10,782 and the coupon counts one use", async () => {
      await expect(shopper.getByRole("heading", { level: 1 })).toHaveText(/^Order #\d+$/);
      await expect(shopper.getByText(`Discount (${code})`)).toBeVisible();
      await expect(shopper.getByRole("main").getByText("₡10,782").first()).toBeVisible();
      await page.reload();
      await expect(
        page.getByRole("main").getByRole("listitem").filter({ hasText: code }),
      ).toContainText("Used 1 time");
    });
  });

  test("Scenario: a code the store doesn't have says so and the cart keeps its total", async ({
    workspace,
    baseURL,
    newVisitor,
  }) => {
    const store = await openStore(workspace, baseURL);
    const shopper = await newVisitor();
    await shopper.goto(`${store}/products/pura-vida-mug`);
    await shopper.getByRole("button", { name: "Add to cart" }).click();
    await expect(shopper.getByRole("main").getByRole("status")).toContainText(
      "Added to your cart.",
    );
    await shopper.goto(`${store}/cart`);
    await shopper.getByText("Have a discount code?").click();
    await shopper.getByLabel("Discount code").fill("NOPE2026");
    await shopper.getByRole("button", { name: "Apply" }).click();
    await expect(shopper.getByRole("alert")).toHaveText("That code doesn't exist in this store.");
    await expect(shopper.getByText("₡5,990").last()).toBeVisible();
  });
});
