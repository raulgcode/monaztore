import {
  saveEinvoicingCredentials,
  saveEinvoicingIssuer,
  saveEinvoicingProduct,
  setEinvoicingEnabled,
  type TenantContext,
} from "@monaztore/core";
import { deriveSecret } from "@monaztore/env";
import { testCertificate } from "@monaztore/hacienda/testing";
import { expect, test } from "../support/fixtures";
import { openSection } from "../support/navigation";
import { openStore } from "../support/storefront";

// Hacienda isn't reachable from the tests: the key and the API user are saved through core,
// with a login check that always says yes, sealed with the same key the web server uses.
async function saveTestCredentials(tenant: TenantContext) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set (see .env.example)");
  await saveEinvoicingCredentials(
    tenant,
    {
      haciendaUsername: "cpf-01-1234-0567@stag.comprobanteselectronicos.go.cr",
      haciendaPassword: "test-password",
      certificatePin: "1234",
      certificate: testCertificate("1234"),
    },
    { sealKey: deriveSecret(secret, "einvoicing"), verifyLogin: async () => true },
  );
}

const issuer = {
  idNumber: "112340567",
  name: "Ana Mora Solís",
  commercialName: "",
  email: "facturas@example.com",
  phone: "",
  activityCode: "478201",
  district: "1-01-01",
  address: "100 m norte de la iglesia",
};

test.describe("Feature: electronic invoicing for a store in Costa Rica", () => {
  test("Scenario: the owner fills in their details and what they sell, and turns invoicing on in Hacienda's test environment", async ({
    page,
    signInWithWorkspace,
    workspaceOf,
  }) => {
    await test.step("Given an owner with a new store", async () => {
      await signInWithWorkspace(page);
    });

    await test.step("When they open Electronic invoicing from Store", async () => {
      await openSection(page, "Store");
      await page.getByRole("link", { name: /^Electronic invoicing/ }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Electronic invoicing");
      await expect(page.getByTestId("einvoicing-status")).toHaveText(
        "Off. Finish the steps below and turn it on. Steps left: 3",
      );
    });

    await test.step("And save their details as they are in Hacienda", async () => {
      await page.getByLabel("ID (cédula)", { exact: true }).fill(issuer.idNumber);
      await page.getByLabel("Name or company name").fill(issuer.name);
      await page.getByLabel("Email for invoices").fill(issuer.email);
      await page.getByLabel("Economic activity").fill(issuer.activityCode);
      await page.getByLabel("Province").selectOption("1");
      await page.getByLabel("District", { exact: true }).selectOption(issuer.district);
      await page.getByLabel("Exact address").fill(issuer.address);
      await page.getByRole("button", { name: "Save my details" }).click();
      await expect(page.getByText("Your details are saved.")).toBeVisible();
    });

    await test.step("And the CABYS code of what they sell", async () => {
      await page.getByLabel("CABYS code").fill("2399999009900");
      await page.getByRole("button", { name: "Use this code" }).click();
      await expect(page.getByText("The code is saved.")).toBeVisible();
      await expect(page.getByTestId("einvoicing-status")).toHaveText(
        "Off. Finish the steps below and turn it on. Steps left: 1",
      );
    });

    await test.step("And their Hacienda key is saved", async () => {
      await saveTestCredentials((await workspaceOf(page)).tenant);
      await page.reload();
    });

    await test.step("Then they turn it on and the page says it's on, in the test environment", async () => {
      await page.getByRole("button", { name: "Turn on electronic invoicing" }).click();
      await expect(page.getByText("Electronic invoicing is on.")).toBeVisible();
      await expect(page.getByTestId("einvoicing-status")).toHaveText(
        "On, in Hacienda's test environment: nothing you issue counts for taxes",
      );
      await expect(page.getByRole("button", { name: "Turn off" })).toBeVisible();
    });
  });

  test("Scenario: a shopper asks for the invoice in their name, and the paid order sends it to Hacienda", async ({
    page,
    baseURL,
    signInWithWorkspace,
    workspaceOf,
    newVisitor,
  }) => {
    const { workspace, store } = await test.step("Given a store with invoicing on", async () => {
      await signInWithWorkspace(page);
      const workspace = await workspaceOf(page);
      const store = await openStore(workspace, baseURL);
      await saveEinvoicingIssuer(workspace.tenant, issuer);
      await saveEinvoicingProduct(workspace.tenant, {
        cabys: "2399999009900",
        cabysDescription: "Tazas de cerámica",
      });
      await saveTestCredentials(workspace.tenant);
      await setEinvoicingEnabled(workspace.tenant, true);
      return { workspace, store };
    });

    const shopper = await newVisitor();
    await test.step("When a shopper orders the mug with an invoice in their company's name", async () => {
      await shopper.goto(`${store}/products/pura-vida-mug`);
      await shopper.getByRole("button", { name: "Add to cart" }).click();
      await expect(shopper.getByRole("main").getByRole("status")).toContainText("Added");
      await shopper.goto(`${store}/checkout`);
      await shopper.getByLabel("Email", { exact: true }).fill("compras@example.com");
      await shopper.getByLabel("Full name").fill("Luis Vargas");
      await shopper.getByLabel("Phone", { exact: true }).fill("8888-0000");
      await shopper.getByLabel("Address", { exact: true }).fill("Del parque 200 m sur");
      await shopper.getByLabel("City or town").fill("Heredia");
      await shopper.getByLabel("Province").fill("Heredia");
      await shopper.getByText("Invoice in my name (optional)").click();
      await shopper.getByLabel("ID (cédula)").fill("3-101-123456");
      await shopper.getByLabel("Name on the invoice").fill("Café Vargas S.A.");
      await shopper.getByRole("radio", { name: /SINPE Móvil/ }).check();
      await shopper.getByRole("button", { name: "Place order" }).click();
      await expect(shopper.getByRole("heading", { level: 1 })).toHaveText(/^Order #\d+$/);
    });
    const number = (await shopper.getByRole("heading", { level: 1 }).textContent())?.slice(7);

    await test.step("And the owner confirms the payment", async () => {
      await page.goto(`/app/${workspace.slug}/orders/${number}`);
      await page.getByRole("button", { name: "Confirm payment" }).click();
      await expect(page.getByRole("main").getByRole("status").first()).toHaveText(
        "Payment confirmed.",
      );
    });

    await test.step("Then the order carries its electronic invoice to the company, on its way to Hacienda", async () => {
      const section = page.getByRole("region", { name: "Electronic invoice" });
      const document = section.getByRole("listitem");
      await expect(document).toHaveCount(1);
      await expect(document).toContainText("Electronic invoice");
      await expect(document).toContainText("Sending");
      await expect(document).toContainText("Test");
      await expect(document).toContainText("Number 00100001010000000001 · Café Vargas S.A.");
    });
  });
});
