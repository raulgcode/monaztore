import { describe, expect, it } from "vitest";
import { pageMeta, productJsonLd, storeOrigin } from "./store-seo";

describe("storeOrigin", () => {
  it("points to the primary domain over HTTPS, whatever answered", () => {
    expect(storeOrigin("mitienda.cr", "http://www.mitienda.cr/products/x")).toBe(
      "https://mitienda.cr",
    );
  });
  it("keeps protocol and port on a local host", () => {
    expect(storeOrigin("tienda.localhost", "http://tienda.localhost:5173/")).toBe(
      "http://tienda.localhost:5173",
    );
  });
});

describe("pageMeta", () => {
  it("adds the share card, large only with an image", () => {
    const meta = pageMeta({
      title: "Taza",
      description: "De cerámica",
      canonical: "https://t.cr/products/taza",
      image: "https://t.cr/taza.jpg",
      type: "product",
      siteName: "Tienda",
    });
    expect(meta).toContainEqual({
      tagName: "link",
      rel: "canonical",
      href: "https://t.cr/products/taza",
    });
    expect(meta).toContainEqual({ property: "og:image", content: "https://t.cr/taza.jpg" });
    expect(meta).toContainEqual({ name: "twitter:card", content: "summary_large_image" });
  });
});

describe("productJsonLd", () => {
  it("writes the offer with a decimal price and stock", () => {
    const ld = productJsonLd({
      name: "Taza",
      description: "De cerámica",
      url: "https://t.cr/products/taza",
      images: [],
      sku: "T1",
      price: 599_050,
      currency: "CRC",
      inStock: false,
      brand: "Tienda",
    });
    expect((ld as { "script:ld+json": unknown })["script:ld+json"]).toMatchObject({
      sku: "T1",
      offers: {
        price: "5990.50",
        priceCurrency: "CRC",
        availability: "https://schema.org/OutOfStock",
      },
    });
  });
  it("leaves out the offer when the product has no price", () => {
    const ld = productJsonLd({
      name: "Taza",
      description: "",
      url: "u",
      images: [],
      sku: null,
      price: null,
      currency: "CRC",
      inStock: true,
      brand: "T",
    });
    expect((ld as { "script:ld+json": unknown })["script:ld+json"]).not.toHaveProperty("offers");
  });
});
