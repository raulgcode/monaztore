import { randomUUID } from "node:crypto";
import type { CheckoutInput, ImportedProduct } from "@monaztore/contracts";
import { createTestDatabase, createTestTenant } from "@monaztore/db/testing";
import { memoryFileStore } from "@monaztore/storage";
import { afterAll, describe, expect, it } from "vitest";
import { importCatalog, listImportedProducts } from "./catalog-import";
import {
  addProductFile,
  createDigitalProduct,
  findProductsWithoutFiles,
  getDigitalProduct,
  listDigitalProducts,
  removeProductFile,
  setDownloadRules,
} from "./digital-products";
import { DomainError } from "./errors";
import {
  getDownloadsByLink,
  getOrderByToken,
  openLinkDownload,
  openOrderDownload,
  placeOrder,
  priceCart,
  updateStorePayments,
} from "./orders";
import { cancelOrder, getOrder, markOrderPaid, renewDownloadsLink } from "./store-admin";
import type { StorefrontContext } from "./storefront";
import type { TenantContext } from "./tenant";
import { resolveTenant } from "./workspaces";

const connection = createTestDatabase();
afterAll(() => connection.close());
const db = connection.db;

const pdf = (text = "%PDF-1.7 guide") => ({
  bytes: new TextEncoder().encode(text),
  fileName: "Guía de inicio.pdf",
  contentType: "application/pdf",
});

const contact: CheckoutInput = {
  email: "ana@example.com",
  name: "Ana Mora",
  phone: "8888-0000",
  line1: "",
  city: "",
  province: "",
  notes: "",
  paymentMethod: "sinpe",
};

const mug = (): ImportedProduct => ({
  externalId: "mug",
  slug: "mug",
  name: "Mug",
  description: "",
  shortDescription: "",
  status: "active",
  sku: null,
  price: 600_000,
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
});

/** A store taking SINPE with a mug to ship and, made in the workspace, an e-book. */
async function shop() {
  const tenant = await createTestTenant(db);
  const owner = (await resolveTenant(db, tenant.userId, tenant.slug)) as TenantContext;
  const files = memoryFileStore();
  await importCatalog(owner, {
    source: "woocommerce",
    sourceUrl: "https://shop.example",
    currency: "CRC",
    categories: [],
    products: [mug()],
    customers: [],
    warnings: [],
  });
  await updateStorePayments(owner, {
    sinpe: { enabled: true, phone: "8888-1234", holder: "Tienda S.A." },
  });
  const ebook = await createDigitalProduct(
    owner,
    { files },
    {
      name: "Guía de inicio",
      price: 500_000,
      description: "Todo lo que necesitas.\n\nEn PDF.",
      file: pdf(),
    },
  );
  const [imported] = await listImportedProducts(owner, "woocommerce");
  const store: StorefrontContext = {
    db,
    store: {
      organizationId: tenant.organizationId,
      name: "Tienda",
      slug: tenant.slug,
      hostname: "t.test",
    },
  };
  return { tenant, owner, files, ebook, mugId: imported?.id as string, store };
}

const code = (promise: Promise<unknown>) =>
  promise.then(
    () => "ok",
    (error: unknown) => (error instanceof DomainError ? error.code : String(error)),
  );

describe("digital products in the workspace", () => {
  it("creates one on sale with its file kept out of the public photos, and 5 downloads for 30 days", async () => {
    const { owner, files, ebook } = await shop();

    const product = await getDigitalProduct(owner, ebook);
    expect(product).toMatchObject({
      name: "Guía de inicio",
      slug: "guia-de-inicio",
      status: "active",
      price: 500_000,
      downloadLimit: 5,
      downloadDays: 30,
      files: [{ fileName: "Guía de inicio.pdf", size: 14 }],
    });
    expect(files.keys()).toEqual([
      expect.stringMatching(/^downloads\/[0-9a-f-]+\/[0-9a-f]{32}\.pdf$/),
    ]);
    expect(await listDigitalProducts(owner)).toMatchObject([{ id: ebook, files: 1 }]);
  });

  it("adds a file to a product the store already sells, and takes it away", async () => {
    const { owner, files, mugId } = await shop();

    expect(await findProductsWithoutFiles(owner, "mu")).toEqual([
      { id: mugId, name: "Mug", status: "active" },
    ]);
    await addProductFile(owner, { files }, mugId, {
      bytes: new Uint8Array([1, 2, 3]),
      fileName: "../../etc/passwd",
      contentType: "text/html; charset=utf-8",
    });
    const product = await getDigitalProduct(owner, mugId);
    expect(product?.files).toMatchObject([{ fileName: "passwd", size: 3 }]);
    expect(await findProductsWithoutFiles(owner, "mu")).toEqual([]);
    expect(await listDigitalProducts(owner)).toHaveLength(2);

    await removeProductFile(owner, mugId, product?.files[0]?.id as string);
    expect((await getDigitalProduct(owner, mugId))?.files).toEqual([]);
  });

  it("only owners change them, and another workspace neither sees nor touches them", async () => {
    const { tenant, owner, files, ebook } = await shop();
    const memberTenant = await createTestTenant(db, { role: "member" });
    const member = { ...owner, userId: memberTenant.userId, role: "member" };
    expect(await code(addProductFile(member, { files }, ebook, pdf()))).toBe("forbidden");
    expect(await code(setDownloadRules(member, ebook, { downloadLimit: 1, downloadDays: 1 }))).toBe(
      "forbidden",
    );

    const other = await createTestTenant(db);
    const stranger = (await resolveTenant(db, other.userId, other.slug)) as TenantContext;
    expect(stranger.organizationId).not.toBe(tenant.organizationId);
    expect(await getDigitalProduct(stranger, ebook)).toBeUndefined();
    expect(await listDigitalProducts(stranger)).toEqual([]);
    expect(await code(addProductFile(stranger, { files }, ebook, pdf()))).toBe("not_found");
    expect(await code(removeProductFile(stranger, ebook, randomUUID()))).toBe("not_found");
    expect(
      await code(setDownloadRules(stranger, ebook, { downloadLimit: null, downloadDays: null })),
    ).toBe("not_found");
  });
});

describe("buying a digital product", () => {
  it("asks for no address when everything is a download, and for one when something ships", async () => {
    const { store, ebook, mugId } = await shop();

    const onlyEbook = await priceCart(store, [{ productId: ebook, variantId: null, quantity: 1 }]);
    expect(onlyEbook).toMatchObject({ needsShipping: false, lines: [{ digital: true }] });
    const mixed = [
      { productId: ebook, variantId: null, quantity: 1 },
      { productId: mugId, variantId: null, quantity: 1 },
    ];
    expect(await priceCart(store, mixed)).toMatchObject({ needsShipping: true });
    expect(await code(placeOrder(store, { cart: mixed, checkout: contact, locale: "es" }))).toBe(
      "address_required",
    );

    const placed = await placeOrder(store, {
      cart: [{ productId: ebook, variantId: null, quantity: 1 }],
      checkout: { ...contact, line1: "ignored", city: "x", province: "y" },
      locale: "es",
    });
    const order = await getOrderByToken(store, placed.token);
    expect(order).toMatchObject({
      needsShipping: false,
      shippingAddress: { line1: "", city: "", province: "" },
      downloads: [{ fileName: "Guía de inicio.pdf", remaining: 5, available: false }],
    });
  });

  it("opens the files only once the store marks it paid, and emails a link of its own", async () => {
    const { owner, store, ebook } = await shop();
    const placed = await placeOrder(store, {
      cart: [{ productId: ebook, variantId: null, quantity: 1 }],
      checkout: contact,
      locale: "es",
    });
    const download = (await getOrderByToken(store, placed.token))?.downloads[0];
    expect(await openOrderDownload(store, placed.token, download?.id as string)).toEqual({
      ok: false,
      reason: "not_paid",
    });

    const paidAt = new Date("2026-11-01T12:00:00Z");
    const { downloads: link } = await markOrderPaid(owner, placed.number, paidAt);
    expect(link).toMatchObject({
      number: placed.number,
      email: "ana@example.com",
      name: "Ana Mora",
      locale: "es",
      files: ["Guía de inicio.pdf"],
    });
    const token = link?.token as string;
    const later = new Date("2026-11-02T12:00:00Z");
    expect(await getDownloadsByLink(store, token, later)).toMatchObject({
      number: placed.number,
      downloads: [{ available: true, remaining: 5, expiresAt: new Date("2026-12-01T12:00:00Z") }],
    });
    expect(await openLinkDownload(store, token, download?.id as string, later)).toMatchObject({
      ok: true,
      file: { fileName: "Guía de inicio.pdf", contentType: "application/pdf", size: 14 },
    });
    expect(
      await openOrderDownload(store, placed.token, download?.id as string, later),
    ).toMatchObject({
      ok: true,
    });
    expect((await getOrder(owner, placed.number))?.downloads).toMatchObject([
      { fileName: "Guía de inicio.pdf", downloads: 2, downloadLimit: 5 },
    ]);

    // Sending the link again makes a new one: the old one stops working.
    const renewed = await renewDownloadsLink(owner, placed.number);
    expect(renewed?.token).not.toBe(token);
    expect(await getDownloadsByLink(store, token)).toBeUndefined();
    expect(await openLinkDownload(store, token, download?.id as string)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await getDownloadsByLink(store, renewed?.token as string, later)).toBeDefined();
  });

  it("stops after its downloads (per unit bought) and after its days", async () => {
    const { owner, store, ebook } = await shop();
    await setDownloadRules(owner, ebook, { downloadLimit: 1, downloadDays: 2 });
    const placed = await placeOrder(store, {
      cart: [{ productId: ebook, variantId: null, quantity: 2 }],
      checkout: contact,
      locale: "es",
    });
    const paidAt = new Date("2026-11-01T12:00:00Z");
    await markOrderPaid(owner, placed.number, paidAt);
    const id = (await getOrderByToken(store, placed.token))?.downloads[0]?.id as string;
    const soon = new Date("2026-11-02T12:00:00Z");

    const tries = await Promise.all(
      [1, 2, 3].map(() => openOrderDownload(store, placed.token, id, soon)),
    );
    expect(tries.filter((result) => result.ok)).toHaveLength(2);
    expect(tries.find((result) => !result.ok)).toEqual({ ok: false, reason: "used_up" });

    await setDownloadRules(owner, ebook, { downloadLimit: null, downloadDays: 2 });
    const unlimited = await placeOrder(store, {
      cart: [{ productId: ebook, variantId: null, quantity: 1 }],
      checkout: contact,
      locale: "es",
    });
    await markOrderPaid(owner, unlimited.number, paidAt);
    const other = (await getOrderByToken(store, unlimited.token))?.downloads[0]?.id as string;
    expect((await openOrderDownload(store, unlimited.token, other, soon)).ok).toBe(true);
    expect(
      await openOrderDownload(store, unlimited.token, other, new Date("2026-11-03T12:00:01Z")),
    ).toEqual({ ok: false, reason: "expired" });
  });

  it("keeps what was bought when the store changes the product's files", async () => {
    const { owner, store, ebook, files } = await shop();
    const placed = await placeOrder(store, {
      cart: [{ productId: ebook, variantId: null, quantity: 1 }],
      checkout: contact,
      locale: "es",
    });
    const product = await getDigitalProduct(owner, ebook);
    await removeProductFile(owner, ebook, product?.files[0]?.id as string);
    await addProductFile(owner, { files }, ebook, pdf("%PDF-1.7 second edition"));
    await markOrderPaid(owner, placed.number);

    const downloads = (await getOrderByToken(store, placed.token))?.downloads;
    expect(downloads).toHaveLength(1);
    expect(downloads?.[0]).toMatchObject({ size: 14, available: true });
  });

  it("a cancelled order never opens, and another store's links open nothing", async () => {
    const { owner, store, ebook } = await shop();
    const placed = await placeOrder(store, {
      cart: [{ productId: ebook, variantId: null, quantity: 1 }],
      checkout: contact,
      locale: "es",
    });
    const id = (await getOrderByToken(store, placed.token))?.downloads[0]?.id as string;
    await cancelOrder(owner, placed.number);
    expect(await openOrderDownload(store, placed.token, id)).toEqual({
      ok: false,
      reason: "not_paid",
    });
    expect(await renewDownloadsLink(owner, placed.number)).toBeUndefined();

    const paid = await placeOrder(store, {
      cart: [{ productId: ebook, variantId: null, quantity: 1 }],
      checkout: contact,
      locale: "es",
    });
    const { downloads: link } = await markOrderPaid(owner, paid.number);
    const paidId = (await getOrderByToken(store, paid.token))?.downloads[0]?.id as string;
    const elsewhere = (await shop()).store;
    expect(await openOrderDownload(elsewhere, paid.token, paidId)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await getDownloadsByLink(elsewhere, link?.token as string)).toBeUndefined();
    // Another order's file through this order's link: not found either.
    expect(await openOrderDownload(store, paid.token, id)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("an order of things to ship sends no downloads email", async () => {
    const { owner, store, mugId } = await shop();
    const placed = await placeOrder(store, {
      cart: [{ productId: mugId, variantId: null, quantity: 1 }],
      checkout: { ...contact, line1: "100 m norte", city: "Heredia", province: "Heredia" },
      locale: "es",
    });
    expect(await markOrderPaid(owner, placed.number)).toEqual({ downloads: null });
    expect(await getOrderByToken(store, placed.token)).toMatchObject({
      needsShipping: true,
      downloads: [],
    });
  });
});
