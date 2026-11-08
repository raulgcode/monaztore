import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  CATALOG_OPTIONS_MAX,
  catalogParams,
  emptyCatalogQuery,
  readCatalogQuery,
  withoutFilter,
} from "./catalog-query";

const read = (search: string) => readCatalogQuery(new URLSearchParams(search));

describe("readCatalogQuery", () => {
  it("is the plain catalog without params", () => {
    expect(read("")).toEqual(emptyCatalogQuery);
  });
  it("reads every filter, with prices in minor units", () => {
    expect(
      read("q=medias&sort=price-asc&min=1000&max=5000&stock=1&sale=1&f.Talla=M&f.Talla=L&page=2"),
    ).toEqual({
      q: "medias",
      sort: "price-asc",
      minPrice: 100_000,
      maxPrice: 500_000,
      inStock: true,
      onSale: true,
      options: { Talla: ["M", "L"] },
      page: 2,
    });
  });
  it("swaps a minimum above the maximum and ignores odd values", () => {
    const query = read("min=900&max=100&sort=cheapest&page=-3&f.Talla=&stock=yes");
    expect(query).toMatchObject({
      minPrice: 10_000,
      maxPrice: 90_000,
      sort: "newest",
      page: 1,
      options: {},
      inStock: false,
    });
  });
  it("keeps a bounded number of options and no repeated values", () => {
    const params = Array.from({ length: 12 }, (_, i) => `f.o${i}=x&f.o${i}=x`).join("&");
    const query = read(params);
    expect(Object.keys(query.options)).toHaveLength(CATALOG_OPTIONS_MAX);
    expect(query.options.o0).toEqual(["x"]);
  });
});

describe("catalogParams", () => {
  it("writes back what it reads, leaving defaults out", () => {
    const search = "q=medias&sort=price-desc&min=10&stock=1&f.Color=Rojo";
    expect(catalogParams(read(search)).toString()).toBe(new URLSearchParams(search).toString());
    expect(catalogParams(emptyCatalogQuery).toString()).toBe("");
  });
});

describe("filters", () => {
  const query = read("min=10&stock=1&f.Talla=M&f.Talla=L");
  it("counts each value and the price range once", () => {
    expect(activeFilterCount(query)).toBe(4);
  });
  it("takes one away and goes back to page 1", () => {
    const next = withoutFilter(
      { ...query, page: 3 },
      { kind: "option", name: "Talla", value: "M" },
    );
    expect(next.options).toEqual({ Talla: ["L"] });
    expect(next.page).toBe(1);
    expect(withoutFilter(next, { kind: "option", name: "Talla", value: "L" }).options).toEqual({});
    expect(withoutFilter(query, { kind: "price" }).minPrice).toBeNull();
  });
});
