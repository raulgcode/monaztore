import { describe, expect, it } from "vitest";
import { type CatalogFacets, optionFilterKey, withoutHiddenFilters } from "./storefront";

const facets: CatalogFacets = {
  price: { min: 450_000, max: 900_000 },
  options: [
    { name: "Talla", values: [{ value: "M", count: 3 }] },
    { name: "Diseño", values: [{ value: "Flores", count: 1 }] },
  ],
  inStock: 3,
  onSale: 1,
  availability: true,
};

describe("withoutHiddenFilters", () => {
  it("leaves everything when the owner turned nothing off", () => {
    expect(withoutHiddenFilters(facets, [])).toBe(facets);
  });

  it("drops the price, an option and availability the owner turned off", () => {
    const shown = withoutHiddenFilters(facets, [
      "price",
      optionFilterKey("Diseño"),
      "availability",
    ]);
    expect(shown.price).toBeNull();
    expect(shown.options.map((option) => option.name)).toEqual(["Talla"]);
    expect(shown.availability).toBe(false);
  });
});
