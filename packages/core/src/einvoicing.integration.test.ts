import type { CheckoutInput } from "@monaztore/contracts";
import { eq, schema } from "@monaztore/db";
import { createTestDatabase, createTestTenant } from "@monaztore/db/testing";
import type { HaciendaGateway, HaciendaVerdict, Submission } from "@monaztore/hacienda";
import { HaciendaAuthError } from "@monaztore/hacienda";
import { testCertificate } from "@monaztore/hacienda/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importCatalog, listImportedProducts } from "./catalog-import";
import { type AcceptedEinvoice, deliverEinvoices } from "./einvoice-delivery";
import {
  countEinvoicesToReview,
  getEinvoiceFile,
  getEinvoicing,
  getOrderEinvoices,
  issueOrderEinvoice,
  listEinvoices,
  retryEinvoice,
  saveEinvoicingCredentials,
  saveEinvoicingIssuer,
  saveEinvoicingOptions,
  saveEinvoicingProduct,
  setEinvoicingEnabled,
} from "./einvoicing";
import { getOrderByToken, getShopperEinvoiceFile, placeOrder, updateStorePayments } from "./orders";
import { markOrderPaid } from "./store-admin";
import type { StorefrontContext } from "./storefront";
import type { TenantContext } from "./tenant";
import { resolveTenant } from "./workspaces";

const connection = createTestDatabase();
afterAll(() => connection.close());
const db = connection.db;

const sealKey = "test-einvoicing-key";
let p12: Buffer;
beforeAll(() => {
  p12 = testCertificate("1234");
});

const issuer = {
  idNumber: "112340567",
  name: "Ana Pérez Mora",
  commercialName: "Super Chiva",
  email: "ventas@superchiva.cr",
  phone: "8888-1234",
  activityCode: "478201",
  district: "1-02-03",
  address: "100 m norte de la iglesia",
};

const credentials = {
  haciendaUsername: "cpf-01-1234-0567@stag.comprobanteselectronicos.go.cr",
  haciendaPassword: "secreta",
  certificatePin: "1234",
};

const acceptLogin = { sealKey, verifyLogin: async () => true };

const checkout: CheckoutInput = {
  email: "luis@example.com",
  name: "Luis Mora",
  phone: "8888-0000",
  line1: "Del parque 100 m norte",
  city: "Heredia",
  province: "Heredia",
  notes: "",
  paymentMethod: "sinpe",
};

async function newStore() {
  const tenant = await createTestTenant(db);
  const owner = (await resolveTenant(db, tenant.userId, tenant.slug)) as TenantContext;
  await importCatalog(owner, {
    source: "woocommerce",
    sourceUrl: "https://shop.example",
    currency: "CRC",
    categories: [],
    products: [
      {
        externalId: "shirt",
        slug: "shirt",
        name: "Camiseta",
        description: "",
        shortDescription: "",
        status: "active",
        sku: null,
        price: 1_130_000,
        compareAtPrice: null,
        stockQuantity: null,
        inStock: true,
        weightGrams: null,
        seoTitle: null,
        seoDescription: null,
        categoryExternalIds: [],
        images: [],
        options: [],
        variants: [],
        oldPath: null,
      },
    ],
    customers: [],
    warnings: [],
  });
  await updateStorePayments(owner, { sinpe: { enabled: true, phone: "8888", holder: "T" } });
  const [shirt] = await listImportedProducts(owner, "woocommerce");
  const store: StorefrontContext = {
    db,
    store: { organizationId: tenant.organizationId, name: "T", slug: tenant.slug, hostname: "t" },
  };
  const order = (taxId?: Parameters<typeof placeOrder>[1]["taxId"]) =>
    placeOrder(store, {
      cart: [{ productId: shirt?.id as string, variantId: null, quantity: 2 }],
      checkout,
      locale: "es",
      taxId,
    });
  return { owner, store, order };
}

async function readyStore() {
  const store = await newStore();
  await saveEinvoicingIssuer(store.owner, issuer);
  await saveEinvoicingProduct(store.owner, {
    cabys: "2821100000000",
    cabysDescription: "Camisetas",
  });
  await saveEinvoicingCredentials(store.owner, { ...credentials, certificate: p12 }, acceptLogin);
  await setEinvoicingEnabled(store.owner, true);
  return store;
}

/** Hacienda as the test wants it to answer, recording what it got. */
function fakeHacienda(verdicts: HaciendaVerdict[] = [{ state: "accepted", responseXml: "<ok/>" }]) {
  const submitted: Submission[] = [];
  const gateway: HaciendaGateway = {
    async submit(submission) {
      submitted.push(submission);
      return "received";
    },
    async status() {
      return verdicts.shift() ?? { state: "pending" };
    },
  };
  return { gateway, submitted };
}

/** The worker's clock: each round jumps two hours, so every retry is due. */
let clock = Date.now();

/** Runs the worker until nothing is due, as if the time to the next try had passed. */
async function deliverAll(
  organizationId: string,
  gateway: HaciendaGateway,
  notify?: (einvoice: AcceptedEinvoice) => Promise<void>,
) {
  clock = Math.max(clock, Date.now() + 1000);
  for (let round = 0; round < 10; round++) {
    const now = new Date(clock);
    const taken = await deliverEinvoices(db, {
      sealKey,
      gateway: () => gateway,
      notify,
      now: () => now,
      organizationIds: [organizationId],
    });
    clock += 2 * 60 * 60 * 1000;
    if (taken === 0) return;
  }
}

describe("electronic invoicing settings", () => {
  it("is there for a store in Costa Rica and walks through its three steps", async () => {
    const { owner } = await newStore();
    let settings = await getEinvoicing(owner);
    expect(settings).toMatchObject({ available: true, enabled: false, autoIssue: true });
    expect(settings.steps).toEqual({ issuer: false, product: false, credentials: false });

    await saveEinvoicingIssuer(owner, issuer);
    await saveEinvoicingProduct(owner, { cabys: "2821100000000", cabysDescription: "" });
    await saveEinvoicingCredentials(owner, { ...credentials, certificate: p12 }, acceptLogin);
    settings = await getEinvoicing(owner);
    expect(settings.steps).toEqual({ issuer: true, product: true, credentials: true });
    expect(settings.issuer).toMatchObject({ idNumber: "112340567", district: "1-02-03" });
    expect(settings.credentials).toMatchObject({
      environment: "sandbox",
      hasPassword: true,
      hasCertificate: true,
      certificateSubject: "PRUEBA MONAZTORE",
    });
    expect(JSON.stringify(settings)).not.toContain("secreta");
  });

  it("keeps the password and key sealed in the database", async () => {
    const { owner } = await newStore();
    await saveEinvoicingCredentials(owner, { ...credentials, certificate: p12 }, acceptLogin);
    const [row] = await db
      .select()
      .from(schema.storeEinvoicing)
      .where(eq(schema.storeEinvoicing.organizationId, owner.organizationId));
    expect(row?.haciendaPassword).toMatch(/^v1\./);
    expect(row?.haciendaPassword).not.toContain("secreta");
    expect(row?.certificatePin).not.toBe("1234");
  });

  it("refuses a key whose PIN doesn't open it, and a user Hacienda doesn't take", async () => {
    const { owner } = await newStore();
    await expect(
      saveEinvoicingCredentials(
        owner,
        { ...credentials, certificatePin: "9999", certificate: p12 },
        acceptLogin,
      ),
    ).rejects.toMatchObject({ code: "certificate_unreadable" });
    await expect(
      saveEinvoicingCredentials(
        owner,
        { ...credentials, certificate: p12 },
        { sealKey, verifyLogin: async () => false },
      ),
    ).rejects.toMatchObject({ code: "credentials_wrong" });
    expect((await getEinvoicing(owner)).credentials.hasCertificate).toBe(false);
  });

  it("keeps the saved password and key when they are left empty", async () => {
    const { owner } = await newStore();
    await saveEinvoicingCredentials(owner, { ...credentials, certificate: p12 }, acceptLogin);
    const seen: string[] = [];
    await saveEinvoicingCredentials(
      owner,
      { haciendaUsername: credentials.haciendaUsername, haciendaPassword: "", certificatePin: "" },
      {
        sealKey,
        verifyLogin: async (login) => {
          seen.push(login.password);
          return true;
        },
      },
    );
    expect(seen).toEqual(["secreta"]);
  });

  it("only turns on with the three steps done", async () => {
    const { owner } = await newStore();
    await saveEinvoicingIssuer(owner, issuer);
    await expect(setEinvoicingEnabled(owner, true)).rejects.toMatchObject({
      code: "einvoicing_incomplete",
    });
  });

  it("refuses a district that doesn't exist", async () => {
    const { owner } = await newStore();
    await expect(
      saveEinvoicingIssuer(owner, { ...issuer, district: "1-99-01" }),
    ).rejects.toMatchObject({ code: "district_invalid" });
  });

  it("isn't there for a store outside Costa Rica", async () => {
    const { owner } = await newStore();
    await db
      .update(schema.storeSettings)
      .set({ country: "PA" })
      .where(eq(schema.storeSettings.organizationId, owner.organizationId));
    expect((await getEinvoicing(owner)).available).toBe(false);
    await expect(saveEinvoicingIssuer(owner, issuer)).rejects.toMatchObject({
      code: "einvoicing_unavailable",
    });
  });
});

describe("issuing an order's document", () => {
  it("queues a ticket when the store marks the order paid, numbered from 1", async () => {
    const { owner, order } = await readyStore();
    const first = await order();
    const second = await order();
    await markOrderPaid(owner, first.number);
    await markOrderPaid(owner, second.number);
    const { einvoices } = await listEinvoices(owner);
    expect(einvoices.map((doc) => [doc.kind, doc.consecutive, doc.status])).toEqual([
      ["ticket", "00100001040000000002", "queued"],
      ["ticket", "00100001040000000001", "queued"],
    ]);
    expect(einvoices[0]?.clave).toHaveLength(50);
    expect(einvoices[0]?.clave.slice(9, 21)).toBe("000112340567");
  });

  it("makes an invoice out to whom the shopper asked at checkout", async () => {
    const { owner, order } = await readyStore();
    const placed = await order({ idType: "02", idNumber: "3101123456", name: "Las Palmas S.A." });
    await markOrderPaid(owner, placed.number);
    const [doc] = await getOrderEinvoices(owner, placed.number);
    expect(doc).toMatchObject({
      kind: "invoice",
      consecutive: "00100001010000000001",
      receiverName: "Las Palmas S.A.",
    });
  });

  it("doesn't keep the shopper's ID where the store doesn't issue invoices", async () => {
    const { owner, order } = await newStore();
    const placed = await order({ idType: "02", idNumber: "3101123456", name: "Las Palmas S.A." });
    await markOrderPaid(owner, placed.number);
    const [row] = await db
      .select({ taxId: schema.order.taxId })
      .from(schema.order)
      .where(eq(schema.order.organizationId, owner.organizationId));
    expect(row?.taxId).toBeNull();
    expect((await listEinvoices(owner)).total).toBe(0);
  });

  it("issues only from the order's button when the store turned off issuing on payment", async () => {
    const { owner, order } = await readyStore();
    await saveEinvoicingOptions(owner, { autoIssue: false, branch: 2, terminal: 3 });
    const placed = await order();
    await markOrderPaid(owner, placed.number);
    expect((await listEinvoices(owner)).total).toBe(0);

    const doc = await issueOrderEinvoice(owner, placed.number, {
      idType: "01",
      idNumber: "112340567",
      name: "Ana Pérez",
    });
    expect(doc).toMatchObject({ kind: "invoice", consecutive: "00200003010000000001" });
    await expect(issueOrderEinvoice(owner, placed.number)).rejects.toMatchObject({
      code: "einvoice_exists",
    });
  });

  it("won't issue for an order that isn't paid", async () => {
    const { owner, order } = await readyStore();
    const placed = await order();
    await expect(issueOrderEinvoice(owner, placed.number)).rejects.toMatchObject({
      code: "order_not_paid",
    });
  });

  it("keeps another workspace's documents out of sight", async () => {
    const { owner, order } = await readyStore();
    const placed = await order();
    await markOrderPaid(owner, placed.number);
    const [doc] = await listEinvoices(owner).then((list) => list.einvoices);
    const other = await newStore();
    expect((await listEinvoices(other.owner)).total).toBe(0);
    expect(await getOrderEinvoices(other.owner, placed.number)).toEqual([]);
    expect(await getEinvoiceFile(other.owner, doc?.id as string, "document")).toBeUndefined();
  });
});

describe("sending to Hacienda", () => {
  it("signs, sends, and once accepted the shopper gets it and can download it", async () => {
    const { owner, store, order } = await readyStore();
    const placed = await order();
    await markOrderPaid(owner, placed.number);
    const hacienda = fakeHacienda([
      { state: "pending" },
      { state: "accepted", responseXml: "<MensajeHacienda/>" },
    ]);
    const notified: AcceptedEinvoice[] = [];
    await deliverAll(owner.organizationId, hacienda.gateway, async (doc) => {
      notified.push(doc);
    });

    expect(hacienda.submitted).toHaveLength(1);
    const [sent] = hacienda.submitted;
    expect(sent?.issuer).toEqual({ idType: "01", idNumber: "112340567" });
    expect(sent?.signedXml).toContain("<TiqueteElectronico");
    expect(sent?.signedXml).toContain("ds:Signature");
    expect(sent?.issuedAt).toMatch(/-06:00$/);

    const [doc] = await getOrderEinvoices(owner, placed.number);
    expect(doc).toMatchObject({ status: "accepted", hasResponse: true });
    expect(notified).toEqual([
      expect.objectContaining({ email: "luis@example.com", locale: "es", clave: doc?.clave }),
    ]);

    const shopper = await getOrderByToken(store, placed.token);
    expect(shopper?.einvoice).toEqual({
      kind: "ticket",
      consecutive: doc?.consecutive,
      clave: doc?.clave,
    });
    const file = await getShopperEinvoiceFile(store, placed.token, "response");
    expect(file?.xml).toBe("<MensajeHacienda/>");
  });

  it("shows Hacienda's reason when it rejects, and a new document can be issued", async () => {
    const { owner, order } = await readyStore();
    const placed = await order();
    await markOrderPaid(owner, placed.number);
    const hacienda = fakeHacienda([{ state: "rejected", reason: "La cédula no existe" }]);
    await deliverAll(owner.organizationId, hacienda.gateway);
    const [rejected] = await getOrderEinvoices(owner, placed.number);
    expect(rejected).toMatchObject({
      status: "rejected",
      problem: "rejected",
      message: "La cédula no existe",
    });
    expect(await countEinvoicesToReview(owner)).toBe(1);

    const again = await issueOrderEinvoice(owner, placed.number);
    expect(again.consecutive).toBe("00100001040000000002");
  });

  it("stops at a wrong password, and after fixing it a retry sends it", async () => {
    const { owner, order } = await readyStore();
    const placed = await order();
    await markOrderPaid(owner, placed.number);
    const refusing: HaciendaGateway = {
      submit: async () => {
        throw new HaciendaAuthError("invalid_grant");
      },
      status: async () => ({ state: "pending" }),
    };
    await deliverAll(owner.organizationId, refusing);
    const [failed] = await getOrderEinvoices(owner, placed.number);
    expect(failed).toMatchObject({ status: "failed", problem: "credentials" });

    await retryEinvoice(owner, failed?.id as string);
    const hacienda = fakeHacienda();
    await deliverAll(owner.organizationId, hacienda.gateway);
    expect((await getOrderEinvoices(owner, placed.number))[0]?.status).toBe("accepted");
  });

  it("keeps trying while Hacienda doesn't answer, and gives up on sending after a while", async () => {
    const { owner, order } = await readyStore();
    const placed = await order();
    await markOrderPaid(owner, placed.number);
    const down: HaciendaGateway = {
      submit: async () => {
        throw new Error("ECONNRESET");
      },
      status: async () => ({ state: "pending" }),
    };
    await deliverAll(owner.organizationId, down);
    const [doc] = await getOrderEinvoices(owner, placed.number);
    // Ten rounds, each two hours later: still trying (12 attempts before it gives up).
    expect(doc).toMatchObject({ status: "queued", message: "ECONNRESET" });
    await deliverAll(owner.organizationId, down);
    expect((await getOrderEinvoices(owner, placed.number))[0]).toMatchObject({
      status: "failed",
      problem: "unreachable",
    });
  });
});
