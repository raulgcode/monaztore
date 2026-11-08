import type { MetaDescriptor } from "react-router";
import { decimalPrice } from "./money";

/**
 * Where a store's links point: its primary domain over HTTPS. Only a local host (`*.localhost`,
 * in development and e2e) keeps the protocol it was asked with.
 */
export function storeOrigin(canonicalHost: string, requestUrl: string): string {
  const local = canonicalHost === "localhost" || canonicalHost.endsWith(".localhost");
  if (!local) return `https://${canonicalHost}`;
  const url = new URL(requestUrl);
  return `${url.protocol}//${canonicalHost}${url.port ? `:${url.port}` : ""}`;
}

/** A photo's address for a crawler: our own `/media/…` files, on the page's own origin. */
export function absoluteUrl(url: string, base: string): string {
  return new URL(url, base).toString();
}

export interface PageSeo {
  title: string;
  description: string;
  canonical: string;
  image?: string | null;
  type?: "website" | "product";
  siteName: string;
}

/** Title, description, canonical and the card shown when the page is shared. */
export function pageMeta({
  title,
  description,
  canonical,
  image,
  type = "website",
  siteName,
}: PageSeo): MetaDescriptor[] {
  return [
    { title },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: canonical },
    { property: "og:type", content: type },
    { property: "og:site_name", content: siteName },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: canonical },
    ...(image
      ? [
          { property: "og:image", content: absoluteUrl(image, canonical) },
          { name: "twitter:card", content: "summary_large_image" },
        ]
      : [{ name: "twitter:card", content: "summary" }]),
  ];
}

export interface ProductSeoInput {
  name: string;
  description: string;
  url: string;
  images: string[];
  sku: string | null;
  price: number | null;
  currency: string;
  inStock: boolean;
  brand: string;
}

/** schema.org Product, so search engines show price and stock in their results. */
export function productJsonLd(product: ProductSeoInput): MetaDescriptor {
  return {
    "script:ld+json": {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      description: product.description,
      url: product.url,
      image: product.images.map((image) => absoluteUrl(image, product.url)),
      ...(product.sku ? { sku: product.sku } : {}),
      brand: { "@type": "Brand", name: product.brand },
      ...(product.price !== null
        ? {
            offers: {
              "@type": "Offer",
              url: product.url,
              price: decimalPrice(product.price),
              priceCurrency: product.currency,
              availability: product.inStock
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
            },
          }
        : {}),
    },
  };
}
