import { randomUUID } from "node:crypto";
import { expect, test as freshTest, ownerTest as test } from "../support/fixtures";
import { getEmail, uniqueEmail } from "../support/mailpit";
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
      await page.getByRole("button", { name: "New page", exact: true }).click();
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
      await page.getByRole("button", { name: "New page", exact: true }).click();
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

  freshTest(
    "Scenario: the owner starts a personalized product's page from its template, a shopper sends a request and the owner answers it",
    async ({ page, baseURL, newVisitor, signInWithWorkspace, workspaceOf }) => {
      const { store, owner } = await freshTest.step("Given an owner with a store", async () => {
        const email = await signInWithWorkspace(page, "Photo Socks");
        return { owner: email, store: await openStore(await workspaceOf(page), baseURL) };
      });

      await freshTest.step(
        "When they start a page from the “Personalized product” template and publish it",
        async () => {
          await openSection(page, "Pages");
          await page
            .getByRole("button", { name: "Use this template: Personalized product" })
            .click();
          await expect(page.getByRole("heading", { level: 1 })).toHaveText("Edit “Personalized”");
          await page.getByRole("button", { name: "Publish" }).click();
          await expect(page.getByRole("main").getByRole("status").last()).toHaveText(
            /^Published\. It's at .*\/personalized$/,
          );
        },
      );

      const shopper = await newVisitor();
      await freshTest.step("Then a shopper sees its cover and its five steps", async () => {
        await shopper.goto(`${store}/personalized`);
        await expect(shopper.getByRole("heading", { level: 1 })).toHaveText(
          "Your photo, made into a gift",
        );
        await expect(shopper.getByRole("heading", { name: "How it works" })).toBeVisible();
        await expect(shopper.getByRole("heading", { name: "It reaches you" })).toBeVisible();
      });

      const shopperEmail = uniqueEmail("maria");
      await freshTest.step("When the shopper asks for their design with the form", async () => {
        await shopper.getByRole("link", { name: "Ask for yours" }).click();
        await shopper.getByLabel("Your name").fill("María Jiménez");
        await shopper.getByLabel("Your email").fill(shopperEmail);
        await shopper.getByLabel("Your WhatsApp (optional)").fill("8888 1234");
        await shopper
          .getByLabel("Tell us about your design")
          .fill("Socks with my dog Toby, size M.");
        await shopper.getByRole("button", { name: "Send my request" }).click();
      });

      await freshTest.step("Then they are thanked and the owner gets it by email", async () => {
        await expect(shopper.getByRole("status").filter({ hasText: "Thanks!" })).toContainText(
          "Thanks! We got your request",
        );
        const email = await getEmail(owner, {
          subject: "Photo Socks: new request from María Jiménez",
        });
        expect(email.Text).toContain("Socks with my dog Toby, size M.");
      });

      await freshTest.step("When the owner opens Requests", async () => {
        await page.goto(`/app/${(await workspaceOf(page)).slug}`);
        await expect(page.getByRole("link", { name: "1 request to answer" })).toBeVisible();
        await openSection(page, "Requests");
      });

      const request = page.getByRole("listitem").filter({ hasText: "María Jiménez" });
      await freshTest.step(
        "Then the request is there with the shopper's message and where it came from",
        async () => {
          await expect(request).toContainText("Socks with my dog Toby, size M.");
          await expect(request).toContainText("From Personalized");
          await expect(request.getByRole("link", { name: "WhatsApp" })).toHaveAttribute(
            "href",
            /^https:\/\/wa\.me\/50688881234/,
          );
        },
      );

      await freshTest.step("When they mark it as answered", async () => {
        await request.getByRole("button", { name: "Mark as answered" }).click();
        await expect(request.getByRole("button", { name: "Back to “To answer”" })).toBeVisible();
        await page.getByRole("link", { name: "Answered" }).click();
      });

      await freshTest.step("Then it moves to “Answered”", async () => {
        await expect(page.getByRole("listitem").filter({ hasText: "María Jiménez" })).toContainText(
          "Socks with my dog Toby, size M.",
        );
      });
    },
  );

  freshTest(
    "Scenario: the owner makes a page from the front page template the store's front page, with its categories and a card for custom orders, then goes back to the design's",
    async ({ page, baseURL, newVisitor, signInWithWorkspace, workspaceOf }) => {
      const store = await freshTest.step("Given an owner with a store", async () => {
        await signInWithWorkspace(page, "Front Mugs");
        return openStore(await workspaceOf(page), baseURL);
      });

      await freshTest.step(
        "When they start a page from the “Front page” template, retitle its cover and publish it",
        async () => {
          await openSection(page, "Pages");
          await page.getByRole("button", { name: "Use this template: Front page" }).click();
          await expect(page.getByRole("heading", { level: 1 })).toHaveText("Edit “Front page”");
          await page
            .getByRole("group", { name: "1. Cover" })
            .getByLabel("Title", { exact: true })
            .fill("Mugs made in Cartago");
          await page.getByRole("button", { name: "Publish" }).click();
          await expect(page.getByRole("main").getByRole("status").last()).toHaveText(
            /^Published\./,
          );
        },
      );

      const shopper = await newVisitor();
      await freshTest.step(
        "Then the store opens with it, a link to every category and the custom order card",
        async () => {
          await shopper.goto(store);
          await expect(shopper.getByRole("heading", { level: 1 })).toHaveText(
            "Mugs made in Cartago",
          );
          await expect(shopper.getByRole("link", { name: "See the catalog" })).toBeVisible();
          await expect(
            shopper.getByRole("heading", { name: "Didn't find what you were looking for?" }),
          ).toBeVisible();
          await expect(shopper.getByRole("link", { name: "Order a custom one" })).toHaveAttribute(
            "href",
            "/personalized",
          );
          await expect(
            shopper.getByRole("link", { name: "See all the categories" }),
          ).toHaveAttribute("href", "/collections");
        },
      );

      await freshTest.step(
        "When the owner goes back to the design's front page in Pages",
        async () => {
          await page.getByRole("link", { name: "All pages" }).click();
          await expect(page.getByRole("main").getByRole("status").first()).toHaveText(
            "Your store opens with “Front page”. Edit its blocks to change the front page.",
          );
          await page.getByRole("button", { name: "Use the design's front page" }).click();
          await expect(page.getByRole("main").getByRole("status").first()).toHaveText(
            /^Your store opens with the front page of Design\./,
          );
        },
      );

      await freshTest.step("Then the store opens with the design's front page again", async () => {
        await shopper.goto(store);
        await expect(shopper.getByRole("heading", { level: 1 })).not.toHaveText(
          "Mugs made in Cartago",
        );
      });
    },
  );

  test("Scenario: the owner drags a block above another and the preview follows the new order", async ({
    page,
    workspace,
  }) => {
    await test.step("Given a new page with a heading and then a text", async () => {
      await page.goto(`/app/${workspace.slug}/pages`);
      await page.getByRole("button", { name: "New page", exact: true }).click();
      await page
        .getByRole("group", { name: "1. Heading" })
        .getByRole("textbox", { name: "Heading" })
        .fill("Our story");
      await page
        .getByRole("group", { name: "2. Text" })
        .getByRole("textbox", { name: "Text" })
        .fill("We make mugs in Cartago.");
    });

    await test.step("When they drag the text by its handle above the heading", async () => {
      const handle = page.getByRole("button", { name: /^Drag “2\. Text”/ });
      const target = page.getByRole("group", { name: "1. Heading" });
      await handle.scrollIntoViewIfNeeded();
      const from = await handle.boundingBox();
      const to = await target.boundingBox();
      if (!from || !to) throw new Error("The blocks are not on screen");
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + from.width / 2, to.y + 4, { steps: 8 });
      await page.mouse.up();
    });

    await test.step("Then the text is the first block and the heading the second", async () => {
      await expect(
        page.getByRole("group", { name: "1. Text" }).getByRole("textbox", { name: "Text" }),
      ).toHaveText("We make mugs in Cartago.");
      await expect(
        page.getByRole("group", { name: "2. Heading" }).getByRole("textbox", { name: "Heading" }),
      ).toHaveValue("Our story");
    });

    await test.step("When they move the text back down with the keyboard", async () => {
      await page.getByRole("button", { name: /^Drag “1\. Text”/ }).press("ArrowDown");
    });

    await test.step("Then the heading is first again", async () => {
      await expect(
        page.getByRole("group", { name: "1. Heading" }).getByRole("textbox", { name: "Heading" }),
      ).toHaveValue("Our story");
    });
  });
});
