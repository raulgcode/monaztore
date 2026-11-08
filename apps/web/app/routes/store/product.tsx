import { getStoreInfo, getStoreProduct } from "@monaztore/core";
import { ImageIcon } from "lucide-react";
import { data, href, Link } from "react-router";
import { AddToCart } from "~/components/storefront/add-to-cart";
import { Price } from "~/components/storefront/price";
import { ScrollShadow } from "~/components/ui/scroll-shadow";
import { useT } from "~/lib/i18n";
import { pageMeta, productJsonLd, storeOrigin } from "~/lib/store-seo";
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
        <Gallery images={product.images} name={product.name} />
        <div className="grid content-start gap-4">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{product.name}</h1>
          <Price
            price={product.price}
            compareAtPrice={product.compareAtPrice}
            currency={currency}
            from={prices.size > 1}
            className="text-xl"
          />
          <p
            className={
              product.inStock ? "text-sm font-medium" : "text-sm font-medium text-destructive"
            }
          >
            {product.inStock ? t("storefront.inStock") : t("storefront.soldOut")}
          </p>
          <AddToCart
            productId={product.id}
            variants={product.variants}
            optionNames={product.options.map((option) => option.name)}
            currency={currency}
            inStock={product.inStock}
          />
          {product.descriptionHtml ? (
            <div
              className="store-prose"
              // Cleaned in @monaztore/core (`cleanHtml`): formatting and safe links only.
              dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
            />
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

/** Photos side by side that snap into place: a swipe on the phone, a row on a wide screen. */
function Gallery({ images, name }: { images: { url: string; alt: string }[]; name: string }) {
  const t = useT();
  if (images.length === 0) {
    return (
      <div className="relative aspect-square rounded-md bg-muted">
        <ImageIcon aria-hidden className="absolute inset-0 m-auto size-10 text-muted-foreground" />
      </div>
    );
  }
  return (
    <section aria-label={t("storefront.photos", { name })}>
      <ScrollShadow scrollerClassName="flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-md">
        {images.map((image, index) => (
          <figure key={image.url} className="w-full shrink-0 snap-center">
            <img
              src={image.url}
              alt={image.alt}
              width={800}
              height={800}
              // The first photo is the page's largest paint: no lazy loading for it.
              loading={index === 0 ? "eager" : "lazy"}
              fetchPriority={index === 0 ? "high" : undefined}
              decoding="async"
              className="aspect-square w-full rounded-md bg-muted object-cover"
            />
            {images.length > 1 ? (
              <figcaption className="mt-1 text-center text-xs text-muted-foreground">
                {t("storefront.photoOf", {
                  index: String(index + 1),
                  total: String(images.length),
                })}
              </figcaption>
            ) : null}
          </figure>
        ))}
      </ScrollShadow>
    </section>
  );
}
