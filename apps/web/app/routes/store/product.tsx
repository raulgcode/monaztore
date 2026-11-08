import { getStoreInfo, getStoreProduct } from "@monaztore/core";
import { CheckIcon } from "lucide-react";
import { data, href, Link } from "react-router";
import { AddToCart } from "~/components/storefront/add-to-cart";
import { Price } from "~/components/storefront/price";
import { ProductGallery } from "~/components/storefront/product-gallery";
import { useT } from "~/lib/i18n";
import { pageMeta, productJsonLd, storeOrigin } from "~/lib/store-seo";
import { useStoreHighlights } from "~/lib/store-theme";
import { cn } from "~/lib/utils";
import { requireStore } from "~/middleware/store.server";
import type { Route } from "./+types/product";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const store = requireStore(context);
  const [product, info] = await Promise.all([
    getStoreProduct(store, params.slug),
    getStoreInfo(store),
  ]);
  if (!product) throw data("Product not found", { status: 404 });
  const origin = storeOrigin(info.canonicalHost, request.url);
  return {
    product,
    currency: info.currency,
    storeName: info.name,
    canonical: `${origin}${href("/products/:slug", { slug: product.slug })}`,
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [];
  const { product, storeName, canonical, currency } = loaderData;
  const description = product.seoDescription || product.summary || product.name;
  return [
    ...pageMeta({
      title: product.seoTitle || `${product.name} | ${storeName}`,
      description,
      canonical,
      image: product.images[0]?.url,
      type: "product",
      siteName: storeName,
    }),
    productJsonLd({
      name: product.name,
      description,
      url: canonical,
      images: product.images.map((image) => image.url),
      sku: product.sku,
      price: product.price,
      currency,
      inStock: product.inStock,
      brand: storeName,
    }),
  ];
}

export default function Product({ loaderData }: Route.ComponentProps) {
  const t = useT();
  const highlights = useStoreHighlights();
  const { product, currency } = loaderData;
  const prices = new Set(product.variants.map((variant) => variant.price));
  const collection = product.collections[0];

  return (
    <>
      <nav aria-label={t("storefront.breadcrumb")} className="mb-4 text-sm text-muted-foreground">
        <ol className="flex flex-wrap gap-1">
          <li>
            <Link to={href("/")} className="underline-offset-4 hover:underline">
              {t("storefront.home")}
            </Link>
          </li>
          {collection ? (
            <li>
              <span aria-hidden>/ </span>
              <Link
                to={href("/collections/:slug", { slug: collection.slug })}
                className="underline-offset-4 hover:underline"
              >
                {collection.name}
              </Link>
            </li>
          ) : null}
        </ol>
      </nav>
      <div className="grid gap-6 md:grid-cols-2 md:gap-10">
        <ProductGallery images={product.images} name={product.name} />
        <div className="grid content-start gap-4">
          <h1 className="font-heading text-3xl leading-tight font-semibold tracking-tight text-balance md:text-4xl">
            {product.name}
          </h1>
          <Price
            price={product.price}
            compareAtPrice={product.compareAtPrice}
            currency={currency}
            from={prices.size > 1}
            className="text-xl"
          />
          <p
            className={cn(
              "flex items-center gap-2 text-sm font-medium",
              !product.inStock && "text-destructive",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "size-2 rounded-full",
                product.inStock ? "bg-primary" : "bg-destructive",
              )}
            />
            {product.inStock ? t("storefront.inStock") : t("storefront.soldOut")}
          </p>
          {product.digital ? (
            <p className="text-sm text-muted-foreground">{t("storefront.digitalProduct")}</p>
          ) : null}
          <AddToCart
            productId={product.id}
            variants={product.variants}
            optionNames={product.options.map((option) => option.name)}
            currency={currency}
            inStock={product.inStock}
          />
          {highlights.length > 0 ? (
            <ul
              aria-label={t("storefront.highlightsLabel")}
              className="grid gap-2 rounded-[var(--radius)] bg-muted p-4 text-sm"
            >
              {highlights.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <CheckIcon aria-hidden className="size-4 shrink-0 text-primary" />
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
          {product.descriptionHtml ? (
            <div
              className="store-prose"
              // Cleaned in @monaztore/core (`cleanHtml`): formatting and safe links only.
              dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
            />
          ) : null}
          {product.details.length > 0 ? (
            <section aria-labelledby="product-details" className="grid gap-2">
              <h2 id="product-details" className="font-medium">
                {t("storefront.details")}
              </h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                {product.details.map((detail) => (
                  <div key={detail.name} className="contents">
                    <dt className="text-muted-foreground">{detail.name}</dt>
                    <dd>{detail.values.join(", ")}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
          {product.sku ? (
            <p className="text-sm text-muted-foreground">
              {t("storefront.sku", { sku: product.sku })}
            </p>
          ) : null}
          {product.collections.length > 0 ? (
            <p className="text-sm">
              {t("storefront.inCollections")}{" "}
              {product.collections.map((c, index) => (
                <span key={c.slug}>
                  {index > 0 ? ", " : null}
                  <Link
                    to={href("/collections/:slug", { slug: c.slug })}
                    className="underline underline-offset-4"
                  >
                    {c.name}
                  </Link>
                </span>
              ))}
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
