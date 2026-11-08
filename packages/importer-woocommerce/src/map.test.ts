import { describe, expect, it } from "vitest";
import { v3Customers, v3SimpleProduct, v3VariableProduct, v3Variations } from "./fixtures";
import {
  decimalToMinor,
  decodeEntities,
  mapV3Customer,
  mapV3Product,
  pathOf,
  pricing,
  seoFromMeta,
  storeMinorToMinor,
  toGrams,
} from "./map";

describe("decimalToMinor", () => {
  it.each([
    ["12500", 1_250_000],
    ["5990.5", 599_050],
    ["5990.50", 599_050],
    ["0.07", 7],
    ["12,500.00", 1_250_000],
    ["1.999", 199],
  ])("%s → %d céntimos", (value, expected) => {
    expect(decimalToMinor(value)).toBe(expected);
  });

  it.each([[""], ["  "], ["gratis"], [null], [undefined], ["-5"]])("%s has no price", (value) => {
    expect(decimalToMinor(value)).toBeNull();
  });
});

describe("storeMinorToMinor", () => {
  it("brings a shop without decimals to two digits", () => {
    expect(storeMinorToMinor("12000", 0)).toBe(1_200_000);
  });
  it("keeps a shop that already has two", () => {
    expect(storeMinorToMinor("599050", 2)).toBe(599_050);
  });
});

describe("pricing", () => {
  it("shows the regular price crossed out when there is a lower sale price", () => {
    expect(pricing(7500, 5990)).toEqual({ price: 5990, compareAtPrice: 7500 });
  });
  it("ignores a sale price that isn't lower", () => {
    expect(pricing(7500, 9000)).toEqual({ price: 9000, compareAtPrice: null });
    expect(pricing(7500, null)).toEqual({ price: 7500, compareAtPrice: null });
  });
});

describe("helpers", () => {
  it("keeps the old path, decoded, to redirect from", () => {
    expect(pathOf("https://shop.example/producto/caf%C3%A9-tostado/")).toBe(
      "/producto/café-tostado/",
    );
    expect(pathOf("https://shop.example/")).toBeNull();
    expect(pathOf("not a url")).toBeNull();
  });
  it("decodes the entities WordPress writes in names", () => {
    expect(decodeEntities("Camisetas &amp; Polos &#8220;CR&#8221; &#x41;")).toBe(
      "Camisetas & Polos “CR” A",
    );
  });
  it("converts weights to grams", () => {
    expect(toGrams("0.4", "kg")).toBe(400);
    expect(toGrams("2", "lbs")).toBe(907);
    expect(toGrams("", "kg")).toBeNull();
  });
  it("takes the SEO written by hand and leaves out templates", () => {
    expect(
      seoFromMeta([
        { key: "rank_math_title", value: "Café de altura" },
        { key: "rank_math_description", value: "%title% en oferta" },
      ]),
    ).toEqual({ seoTitle: "Café de altura", seoDescription: null });
  });
});

describe("mapV3Product", () => {
  it("maps a simple product with sale price, stock, weight and SEO", () => {
    expect(mapV3Product(v3SimpleProduct, [])).toEqual({
      externalId: "101",
      slug: "taza-pura-vida",
      name: "Taza “Pura Vida”",
      description: "<p>Taza de cerámica</p>",
      shortDescription: "<p>350 ml</p>",
      status: "active",
      sku: "TAZA-01",
      price: 599_050,
      compareAtPrice: 750_000,
      stockQuantity: 12,
      inStock: true,
      weightGrams: 400,
      seoTitle: "Taza Pura Vida | Hecha en CR",
      seoDescription: null,
      categoryExternalIds: ["15"],
      images: [{ url: "https://shop.example/wp-content/uploads/taza.jpg", alt: "Taza blanca" }],
      options: [],
      variants: [],
      oldPath: "/producto/taza-pura-vida/",
    });
  });

  it("maps a draft variable product: only attributes used for variations become options", () => {
    const product = mapV3Product(v3VariableProduct, v3Variations);

    expect(product.status).toBe("draft");
    expect(product.options).toEqual([{ name: "Talla", values: ["S", "M"] }]);
    expect(product.variants).toEqual([
      {
        externalId: "201",
        sku: "CAM-S",
        options: { Talla: "S" },
        price: 1_200_000,
        compareAtPrice: null,
        stockQuantity: 3,
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
        imageUrl: "https://shop.example/wp-content/uploads/cam-m.jpg",
      },
    ]);
  });
});

describe("mapV3Customer", () => {
  it("normalizes the email, falls back to billing names and never assumes marketing consent", () => {
    expect(mapV3Customer(v3Customers.at(0) as (typeof v3Customers)[number])).toEqual({
      externalId: "7",
      email: "ana@example.com",
      firstName: "Ana",
      lastName: "Mora",
      phone: "8888-0000",
      acceptsMarketing: false,
      ordersCount: 0,
      totalSpent: 0,
    });
  });
  it("skips a customer without email", () => {
    expect(mapV3Customer(v3Customers.at(1) as (typeof v3Customers)[number])).toBeNull();
  });
});
