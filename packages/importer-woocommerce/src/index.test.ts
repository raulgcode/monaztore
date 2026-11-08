import { importedCatalogSchema } from "@monaztore/contracts";
import { describe, expect, it } from "vitest";
import type { Fetch } from "./client";
import {
  storeCategories,
  storeVariableProduct,
  storeVariation201,
  storeVariation202,
  v3Categories,
  v3Customers,
  v3SimpleProduct,
  v3VariableProduct,
  v3Variations,
} from "./fixtures";
import { fetchWooCommerceCatalog, WooCommerceClient } from "./index";

/** A fake shop: answers by path and page, and records what was asked. */
function fakeShop(routes: Record<string, unknown[] | unknown>) {
  const requests: { path: string; page: string | null; auth: string | null }[] = [];
  const fetcher: Fetch = async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/wp-json\//, "");
    const page = url.searchParams.get("page");
    const headers = new Headers(init?.headers);
    requests.push({ path, page, auth: headers.get("authorization") });
    const pages = routes[path];
    if (pages === undefined) return new Response("{}", { status: 404 });
    if (!Array.isArray(pages) || !Array.isArray(pages[0])) {
      return Response.json(pages);
    }
    const index = Number(page ?? "1") - 1;
    return Response.json(pages[index] ?? [], {
      headers: { "x-wp-totalpages": String(pages.length) },
    });
  };
  return { fetcher, requests };
}

describe("WooCommerceClient", () => {
  it("reads every page and sends the keys as Basic auth", async () => {
    const { fetcher, requests } = fakeShop({
      "wc/v3/products": [[{ id: 1 }], [{ id: 2 }], [{ id: 3 }]],
    });
    const client = new WooCommerceClient({
      url: "https://shop.example",
      consumerKey: "ck_1",
      consumerSecret: "cs_1",
      fetch: fetcher,
    });

    const items = await client.all<{ id: number }>("wc/v3/products");

    expect(items.map((item) => item.id)).toEqual([1, 2, 3]);
    expect(requests.map((request) => request.page)).toEqual(["1", "2", "3"]);
    expect(requests[0]?.auth).toBe(`Basic ${Buffer.from("ck_1:cs_1").toString("base64")}`);
  });

  it("refuses to send keys over plain http", () => {
    expect(
      () =>
        new WooCommerceClient({
          url: "http://shop.example",
          consumerKey: "ck",
          consumerSecret: "cs",
        }),
    ).toThrow(/HTTPS/);
  });

  it("explains a 401", async () => {
    const fetcher: Fetch = async () => new Response("nope", { status: 401 });
    const client = new WooCommerceClient({ url: "https://shop.example", fetch: fetcher });
    await expect(client.get("wc/v3/products")).rejects.toThrow(/read permission/);
  });
});

describe("fetchWooCommerceCatalog", () => {
  it("with keys, brings categories with their URLs, products with variations, and customers", async () => {
    const { fetcher } = fakeShop({
      "wc/v3/data/currencies/current": { code: "CRC" },
      "wc/v3/settings/products/woocommerce_weight_unit": { value: "kg" },
      "wc/v3/products/categories": [v3Categories],
      "wp/v2/product_cat": [
        [
          { id: 15, link: "https://shop.example/categoria-producto/ropa/" },
          { id: 16, link: "https://shop.example/categoria-producto/ropa/camisetas/" },
        ],
      ],
      "wc/v3/products": [[v3SimpleProduct], [v3VariableProduct]],
      "wc/v3/products/102/variations": [v3Variations],
      "wc/v3/customers": [v3Customers],
    });

    const catalog = await fetchWooCommerceCatalog({
      url: "https://shop.example/",
      consumerKey: "ck",
      consumerSecret: "cs",
      fetch: fetcher,
    });

    expect(importedCatalogSchema.safeParse(catalog).success).toBe(true);
    expect(catalog.currency).toBe("CRC");
    expect(catalog.sourceUrl).toBe("https://shop.example");
    expect(catalog.categories.map((c) => [c.slug, c.parentExternalId, c.oldPath])).toEqual([
      ["ropa", null, "/categoria-producto/ropa/"],
      ["camisetas", "15", "/categoria-producto/ropa/camisetas/"],
    ]);
    expect(catalog.products.map((p) => [p.slug, p.variants.length])).toEqual([
      ["taza-pura-vida", 0],
      ["camiseta-tica", 2],
    ]);
    expect(catalog.customers.map((c) => c.email)).toEqual(["ana@example.com"]);
    expect(catalog.warnings).toEqual([]);
  });

  it("without keys, uses the public Store API and says what it couldn't bring", async () => {
    const { fetcher, requests } = fakeShop({
      "wc/store/v1/products/categories": [storeCategories],
      "wc/store/v1/products": [[storeVariableProduct]],
      "wc/store/v1/products/201": storeVariation201,
      "wc/store/v1/products/202": storeVariation202,
    });

    const catalog = await fetchWooCommerceCatalog({ url: "https://shop.example", fetch: fetcher });

    expect(importedCatalogSchema.safeParse(catalog).success).toBe(true);
    expect(requests.every((request) => request.auth === null)).toBe(true);
    expect(catalog.currency).toBe("CRC");
    expect(catalog.customers).toEqual([]);
    expect(catalog.warnings[0]).toMatch(/without keys/);
    expect(catalog.products[0]?.variants).toEqual([
      {
        externalId: "201",
        sku: "CAM-S",
        options: { Talla: "S" },
        price: 1_000_000,
        compareAtPrice: 1_200_000,
        stockQuantity: null,
        inStock: true,
        imageUrl: null,
      },
      {
        externalId: "202",
        sku: "CAM-M",
        options: { Talla: "M" },
        price: 1_200_000,
        compareAtPrice: null,
        stockQuantity: null,
        inStock: false,
        imageUrl: null,
      },
    ]);
  });
});
