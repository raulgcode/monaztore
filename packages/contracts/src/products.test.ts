import { describe, expect, it } from "vitest";
import {
  attributeValuesOf,
  currentPrice,
  dayOf,
  dayStart,
  formPricesOf,
  pricesOf,
  productFormSchema,
  productInputOf,
  readProductListQuery,
  saleIsOn,
  variantCombinations,
  variantKey,
} from "./products";

const now = new Date("2026-11-08T12:00:00Z");

describe("offers", () => {
  it("costs the offer price only between its dates", () => {
    const prices = { price: 8_000, compareAtPrice: 10_000 };
    expect(currentPrice(prices, { saleStartsAt: null, saleEndsAt: null }, now)).toEqual(prices);
    expect(
      currentPrice(
        prices,
        { saleStartsAt: new Date("2026-11-09T00:00:00Z"), saleEndsAt: null },
        now,
      ),
    ).toEqual({
      price: 10_000,
      compareAtPrice: null,
    });
    expect(currentPrice(prices, { saleStartsAt: null, saleEndsAt: now }, now)).toEqual({
      price: 10_000,
      compareAtPrice: null,
    });
    expect(
      currentPrice(
        { price: 10_000, compareAtPrice: 9_000 },
        { saleStartsAt: null, saleEndsAt: null },
        now,
      ),
    ).toEqual({
      price: 10_000,
      compareAtPrice: null,
    });
    expect(saleIsOn({ saleStartsAt: now, saleEndsAt: null }, now)).toBe(true);
  });

  it("turns the form's price and offer price into what is kept, and back", () => {
    expect(pricesOf(10_000, 8_000)).toEqual({ price: 8_000, compareAtPrice: 10_000 });
    expect(pricesOf(10_000, null)).toEqual({ price: 10_000, compareAtPrice: null });
    expect(formPricesOf(8_000, 10_000)).toEqual({ regular: 10_000, offer: 8_000 });
    expect(formPricesOf(10_000, null)).toEqual({ regular: 10_000, offer: null });
  });

  it("reads a day as midnight where the owner is, and the last day as all of it", () => {
    expect(dayStart("2026-11-20", "America/Costa_Rica")).toEqual(new Date("2026-11-20T06:00:00Z"));
    const end = dayStart("2026-11-20", "America/Costa_Rica", { endOfDay: true });
    expect(end).toEqual(new Date("2026-11-21T06:00:00Z"));
    expect(dayOf(end as Date, "America/Costa_Rica", { endOfDay: true })).toBe("2026-11-20");
    expect(dayStart("2026-03-08", "America/New_York")).toEqual(new Date("2026-03-08T05:00:00Z"));
    expect(dayStart("20-11-2026", "UTC")).toBeNull();
  });
});

describe("variants", () => {
  it("makes every combination of the attributes the shopper picks", () => {
    const combinations = variantCombinations([
      { name: "Talla", values: ["S", "M"], variation: true },
      { name: "Material", values: ["Algodón"], variation: false },
      { name: "Color", values: ["Rojo", "Azul"], variation: true },
    ]);
    expect(combinations).toEqual([
      { Talla: "S", Color: "Rojo" },
      { Talla: "S", Color: "Azul" },
      { Talla: "M", Color: "Rojo" },
      { Talla: "M", Color: "Azul" },
    ]);
    expect(variantKey({ Talla: "S", Color: "Rojo" })).toBe(
      variantKey({ Color: "Rojo", Talla: "S" }),
    );
  });

  it("reads values the way people type them", () => {
    expect(attributeValuesOf("S, M,  L ,m,,XL")).toEqual(["S", "M", "L", "XL"]);
  });
});

describe("productFormSchema", () => {
  const parse = (fields: Record<string, string | string[]>) => productFormSchema.safeParse(fields);

  it("keeps the offer as the price and the regular price crossed out", () => {
    const parsed = parse({
      name: "Camisa",
      status: "active",
      regularPrice: "10 000",
      offerPrice: "8000",
      saleTo: "2026-11-30",
      timeZone: "America/Costa_Rica",
      trackStock: "on",
      stock: "4",
      categoryIds: [],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(productInputOf(parsed.data)).toMatchObject({
      slug: "camisa",
      price: 800_000,
      compareAtPrice: 1_000_000,
      saleStartsAt: null,
      saleEndsAt: new Date("2026-12-01T06:00:00Z"),
      stockQuantity: 4,
      inStock: true,
    });
  });

  it("refuses an offer that isn't lower and a published product without a price", () => {
    expect(parse({ name: "A", regularPrice: "100", offerPrice: "200" }).success).toBe(false);
    expect(parse({ name: "A", status: "active" }).success).toBe(false);
    expect(parse({ name: "A", status: "draft" }).success).toBe(true);
  });

  it("reads variants from their JSON, with their own prices and stock", () => {
    const parsed = parse({
      name: "Camisa",
      regularPrice: "10000",
      trackStock: "on",
      attributes: JSON.stringify([{ name: "Talla", values: ["S", "M"], variation: true }]),
      variants: JSON.stringify([
        {
          options: { Talla: "S" },
          sku: "C-S",
          price: "",
          offerPrice: "",
          stock: "0",
          inStock: true,
          imageUrl: "",
        },
        {
          options: { Talla: "M" },
          sku: "",
          price: "12000",
          offerPrice: "9000",
          stock: "3",
          inStock: true,
          imageUrl: "",
        },
      ]),
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const input = productInputOf(parsed.data);
    expect(input.variants).toMatchObject([
      { sku: "C-S", price: null, compareAtPrice: null, stockQuantity: 0, inStock: false },
      { sku: null, price: 900_000, compareAtPrice: 1_200_000, stockQuantity: 3, inStock: true },
    ]);
    expect(input.stockQuantity).toBeNull();
    expect(parse({ name: "A", variants: '[{"options":{}}]' }).success).toBe(false);
  });
});

describe("readProductListQuery", () => {
  it("reads the list's state from its URL and ignores what isn't valid", () => {
    expect(
      readProductListQuery(
        new URLSearchParams("q= taza &status=draft&stock=low&sort=name&page=2&category=x"),
      ),
    ).toEqual({
      q: "taza",
      status: "draft",
      stock: "low",
      category: "",
      sort: "name",
      page: 2,
    });
    expect(readProductListQuery(new URLSearchParams("status=nope&page=-1"))).toMatchObject({
      status: "all",
      page: 1,
    });
  });
});
