import { randomUUID } from "node:crypto";
import { aiTokenPrefixes } from "@monaztore/contracts";
import {
  hashOAuthToken,
  importCatalog,
  listImportedProducts,
  placeOrder,
  removeAiConnection,
  resolveTenant,
  submitInquiry,
  type TenantContext,
  updateStorePayments,
} from "@monaztore/core";
import { schema } from "@monaztore/db";
import { createTestDatabase, createTestTenant, createTestUser } from "@monaztore/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type App, buildApp } from "../app";

const connection = createTestDatabase();
const { db } = connection;
let app: App;

beforeAll(async () => {
  app = await buildApp({ db, appUrl: "http://localhost:5173", apiUrl: "http://localhost:3001" });
});
afterAll(async () => {
  await app.close();
  await connection.close();
});

/** What Better Auth leaves after someone allows an assistant on the consent page. */
async function connectAssistant(userId: string) {
  const clientId = `client-${randomUUID()}`;
  const secret = randomUUID();
  const now = new Date();
  await db
    .insert(schema.oauthClient)
    .values({ clientId, name: "Claude", redirectUris: ["https://claude.ai/callback"] });
  await db.insert(schema.oauthConsent).values({
    clientId,
    userId,
    scopes: ["store", "offline_access"],
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(schema.oauthAccessToken).values({
    token: hashOAuthToken(secret),
    clientId,
    userId,
    scopes: ["store", "offline_access"],
    expiresAt: new Date(Date.now() + 3_600_000),
    createdAt: now,
  });
  return { clientId, token: `${aiTokenPrefixes.opaqueAccessToken}${secret}` };
}

let rpcId = 0;
async function rpc(token: string | null, method: string, params: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: "/mcp",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    payload: { jsonrpc: "2.0", id: ++rpcId, method, params },
  });
}

/** Calls a tool and reads its JSON answer (or the error the assistant would read). */
async function call(token: string, name: string, args: Record<string, unknown> = {}) {
  const response = await rpc(token, "tools/call", { name, arguments: args });
  expect(response.statusCode).toBe(200);
  const { result } = response.json() as {
    result: { isError?: boolean; content: { text: string }[] };
  };
  const text = result.content[0]?.text ?? "";
  return result.isError ? { error: text } : { data: JSON.parse(text) };
}

describe("the MCP server's door", () => {
  it("answers 401 without a token, pointing at where to sign in", async () => {
    const response = await rpc(null, "tools/list");
    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toContain(
      'resource_metadata="http://localhost:3001/.well-known/oauth-protected-resource/mcp"',
    );
    const metadata = await app.inject({ url: "/.well-known/oauth-protected-resource/mcp" });
    expect(metadata.json()).toMatchObject({
      resource: "http://localhost:3001/mcp",
      authorization_servers: ["http://localhost:5173/api/auth"],
    });
  });

  it("refuses a token that isn't one, and one whose assistant was removed", async () => {
    const tenant = await createTestTenant(db);
    const { clientId, token } = await connectAssistant(tenant.userId);
    expect((await rpc("mcp_at_nope", "tools/list")).statusCode).toBe(401);
    expect((await rpc(token, "tools/list")).statusCode).toBe(200);
    await removeAiConnection(db, tenant.userId, clientId);
    expect((await rpc(token, "tools/list")).statusCode).toBe(401);
  });
});

describe("the stores' tools", () => {
  it("lists only the person's stores and treats another store as one that doesn't exist", async () => {
    const mine = await createTestTenant(db);
    const theirs = await createTestTenant(db);
    const { token } = await connectAssistant(mine.userId);

    const { data } = await call(token, "list_stores");
    expect(data.stores).toEqual([expect.objectContaining({ slug: mine.slug, role: "owner" })]);
    const other = await call(token, "list_products", { store: theirs.slug });
    expect(other.error).toContain(`No store "${theirs.slug}"`);
  });

  it("creates a product, changes only its price and finds it in the catalog", async () => {
    const tenant = await createTestTenant(db);
    const { token } = await connectAssistant(tenant.userId);

    const created = await call(token, "save_product", {
      store: tenant.slug,
      name: "Camiseta azul",
      regularPrice: "12500",
      stock: 4,
      status: "active",
    });
    expect(created.data.product).toMatchObject({
      name: "Camiseta azul",
      slug: "camiseta-azul",
      status: "active",
      regularPrice: "12500",
      stock: 4,
    });

    const changed = await call(token, "save_product", {
      store: tenant.slug,
      productId: created.data.product.id,
      offerPrice: "9990.50",
    });
    expect(changed.data.product).toMatchObject({
      name: "Camiseta azul",
      regularPrice: "12500",
      offerPrice: "9990.50",
      stock: 4,
    });

    const { data } = await call(token, "list_products", { store: tenant.slug, q: "azul" });
    expect(data.products).toEqual([
      expect.objectContaining({ name: "Camiseta azul", price: "9990.50", stock: 4 }),
    ]);
  });

  it("explains a refused change in the schema's own words", async () => {
    const tenant = await createTestTenant(db);
    const { token } = await connectAssistant(tenant.userId);
    const refused = await call(token, "save_product", {
      store: tenant.slug,
      name: "Sin precio",
      status: "active",
    });
    expect(refused.error).toMatch(/regularPrice/);
  });

  it("keeps what only owners do in the workspace for owners", async () => {
    const owner = await createTestTenant(db);
    const userId = await createTestUser(db);
    await db.insert(schema.member).values({
      organizationId: owner.organizationId,
      userId,
      role: "member",
      createdAt: new Date(),
    });
    const { token } = await connectAssistant(userId);

    const coupons = await call(token, "list_coupons", { store: owner.slug });
    expect(coupons.error).toContain("Only the store's owners");
    const products = await call(token, "list_products", { store: owner.slug });
    expect(products.data.total).toBe(0);
  });

  it("makes a coupon an owner can turn off", async () => {
    const tenant = await createTestTenant(db);
    const { token } = await connectAssistant(tenant.userId);
    const saved = await call(token, "save_coupon", {
      store: tenant.slug,
      code: "verano10",
      amount: "10",
    });
    expect(saved.data.coupon).toMatchObject({ code: "VERANO10", kind: "percent", amount: "10" });
    await call(token, "set_coupon_active", {
      store: tenant.slug,
      couponId: saved.data.coupon.id,
      active: false,
    });
    const { data } = await call(token, "list_coupons", { store: tenant.slug });
    expect(data.coupons).toEqual([expect.objectContaining({ code: "VERANO10", active: false })]);
  });

  it("sets the store's shipping options, keeps an option's id and stays in that store", async () => {
    const tenant = await createTestTenant(db);
    const other = await createTestTenant(db);
    const { token } = await connectAssistant(tenant.userId);
    const saved = await call(token, "set_store_shipping", {
      store: tenant.slug,
      methods: [
        { name: "Correos de Costa Rica", price: "2500", freeFrom: "20000" },
        { name: "Retiro en la tienda", price: "0", pickup: true },
      ],
    });
    expect(saved.data.shipping).toEqual([
      expect.objectContaining({
        name: "Correos de Costa Rica",
        price: 250_000,
        freeFrom: 2_000_000,
      }),
      expect.objectContaining({ name: "Retiro en la tienda", price: 0, pickup: true }),
    ]);
    const correos = saved.data.shipping[0].id;
    await call(token, "set_store_shipping", {
      store: tenant.slug,
      methods: [{ id: correos, name: "Correos", price: "3000" }],
    });
    const { data } = await call(token, "get_store", { store: tenant.slug });
    expect(data.shipping).toEqual([
      { id: correos, name: "Correos", price: 300_000, freeFrom: null, pickup: false },
    ]);
    const refused = await call(token, "set_store_shipping", { store: other.slug, methods: [] });
    expect(refused.error).toBeTruthy();
  });

  it("turns on cash on delivery with its note, and keeps it when only SINPE changes", async () => {
    const tenant = await createTestTenant(db);
    const other = await createTestTenant(db);
    const { token } = await connectAssistant(tenant.userId);
    const sinpe = { enabled: true, phone: "8888-1234", holder: "Tienda S.A." };
    const transfer = { enabled: false, bank: "", iban: "", holder: "" };
    const saved = await call(token, "set_store_payments", {
      store: tenant.slug,
      sinpe,
      transfer,
      cash: { enabled: true, note: "Efectivo al mensajero" },
    });
    expect(saved.data.payments.cash).toEqual({ enabled: true, note: "Efectivo al mensajero" });
    const again = await call(token, "set_store_payments", {
      store: tenant.slug,
      sinpe: { ...sinpe, phone: "8888-5678" },
      transfer,
    });
    expect(again.data.payments.cash).toEqual({ enabled: true, note: "Efectivo al mensajero" });
    const refused = await call(token, "set_store_payments", {
      store: other.slug,
      sinpe,
      transfer,
    });
    expect(refused.error).toBeTruthy();
  });
});

/** A store with a mug that takes cash on delivery, and one order of it, #1001. */
async function storeWithCashOrder() {
  const tenant = await createTestTenant(db);
  const owner = (await resolveTenant(db, tenant.userId, tenant.slug)) as TenantContext;
  await importCatalog(owner, {
    source: "woocommerce",
    sourceUrl: "https://shop.example",
    currency: "CRC",
    categories: [],
    products: [
      {
        externalId: "mug",
        slug: "mug",
        name: "Mug",
        description: "",
        shortDescription: "",
        status: "active",
        sku: null,
        price: 500_000,
        compareAtPrice: null,
        stockQuantity: 3,
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
  await updateStorePayments(owner, { cash: { enabled: true, note: "" } });
  const [mug] = await listImportedProducts(owner, "woocommerce");
  await placeOrder(
    {
      db,
      store: { organizationId: tenant.organizationId, name: "T", slug: tenant.slug, hostname: "t" },
    },
    {
      cart: [{ productId: mug?.id as string, variantId: null, quantity: 1 }],
      checkout: {
        email: "ana@example.com",
        name: "Ana Mora",
        phone: "8888-0000",
        line1: "Del parque 100 m norte",
        city: "Heredia",
        province: "Heredia",
        notes: "",
        paymentMethod: "cash",
        shippingMethod: "",
      },
      locale: "es",
    },
  );
  return tenant;
}

describe("the orders' tools", () => {
  it("lists what's left to send, sends it with its tracking number and delivers it paid", async () => {
    const tenant = await storeWithCashOrder();
    const other = await createTestTenant(db);
    const { token } = await connectAssistant(tenant.userId);

    const toShip = await call(token, "list_orders", { store: tenant.slug, status: "to_ship" });
    expect(toShip.data.orders).toEqual([expect.objectContaining({ number: 1001 })]);

    const shipped = await call(token, "mark_order_shipped", {
      store: tenant.slug,
      number: 1001,
      trackingNumber: "RR123CR",
    });
    expect(shipped.data.shipped).toBe(true);
    await call(token, "mark_order_delivered", { store: tenant.slug, number: 1001 });

    const { data } = await call(token, "get_order", { store: tenant.slug, number: 1001 });
    expect(data.order).toMatchObject({
      status: "paid",
      fulfillment: "delivered",
      trackingNumber: "RR123CR",
    });
    const refused = await call(token, "mark_order_shipped", { store: other.slug, number: 1001 });
    expect(refused.error).toBeTruthy();
  });
});

describe("the front page, menus and requests' tools", () => {
  it("builds a landing with a form, makes it the front page and answers its requests", async () => {
    const tenant = await createTestTenant(db);
    const other = await createTestTenant(db);
    const { token } = await connectAssistant(tenant.userId);

    const saved = await call(token, "save_page", {
      store: tenant.slug,
      title: "Medias personalizadas",
      slug: "medias",
      published: true,
      blocks: [
        {
          type: "hero",
          id: "cover",
          eyebrow: "",
          title: "Tu foto en medias",
          text: "",
          image: "",
          illustration: "socks",
          buttonLabel: "Pídelas",
          buttonHref: "#request",
        },
        {
          type: "whatsapp",
          id: "chat",
          title: "",
          text: "",
          label: "",
          phone: "8888 0000",
          message: "",
        },
        { type: "form", id: "request", title: "", text: "", messageLabel: "", buttonLabel: "" },
      ],
    });
    expect(saved.data.page.blocks.map((block: { type: string }) => block.type)).toEqual([
      "hero",
      "whatsapp",
      "form",
    ]);
    const pageId = saved.data.page.id;

    const front = await call(token, "set_front_page", { store: tenant.slug, pageId });
    expect(front.data.pages).toEqual([expect.objectContaining({ id: pageId, isHome: true })]);

    const store = {
      db,
      store: { organizationId: tenant.organizationId, name: "", slug: tenant.slug, hostname: "x" },
    };
    await submitInquiry(store, "medias", {
      blockId: "request",
      name: "Ana",
      email: "ana@example.com",
      phone: "",
      message: "Con mi perro",
    });
    const listed = await call(token, "list_requests", { store: tenant.slug });
    expect(listed.data.waiting).toBe(1);
    const [request] = listed.data.inquiries;
    expect(request).toMatchObject({ name: "Ana", message: "Con mi perro" });

    const theirs = await call(token, "list_requests", { store: other.slug });
    expect(theirs.error).toContain(`No store "${other.slug}"`);

    await call(token, "set_request_status", {
      store: tenant.slug,
      requestId: request.id,
      status: "done",
    });
    expect((await call(token, "list_requests", { store: tenant.slug })).data.waiting).toBe(0);
    await call(token, "delete_request", { store: tenant.slug, requestId: request.id });
    expect(
      (await call(token, "list_requests", { store: tenant.slug, status: "all" })).data.total,
    ).toBe(0);
  });

  it("sets the top menu with a submenu, hides the cover and keeps the rest of the design", async () => {
    const tenant = await createTestTenant(db);
    const { token } = await connectAssistant(tenant.userId);
    await call(token, "update_store_design", { store: tenant.slug, heroTitle: "Chiva" });
    const { data } = await call(token, "update_store_design", {
      store: tenant.slug,
      showHero: false,
      showCategoriesMenu: false,
      menu: [
        {
          label: "Medias",
          href: "/collections/medias",
          children: [{ label: "Con foto", href: "/medias" }],
        },
        { label: "Tazas", href: "/collections/tazas" },
      ],
      footerMenu: [{ label: "Preguntas", href: "/preguntas" }],
    });
    expect(data.design).toMatchObject({
      heroTitle: "Chiva",
      hideHero: true,
      hideCategoriesMenu: true,
      menu: [
        {
          label: "Medias",
          href: "/collections/medias",
          children: [{ label: "Con foto", href: "/medias" }],
        },
        { label: "Tazas", href: "/collections/tazas", children: [] },
      ],
      footerMenu: [{ label: "Preguntas", href: "/preguntas" }],
    });

    const again = await call(token, "update_store_design", {
      store: tenant.slug,
      heroTitle: "Hola",
    });
    expect(again.data.design).toMatchObject({ hideHero: true, menu: expect.any(Array) });
    expect(again.data.design.menu).toHaveLength(2);
  });
});
