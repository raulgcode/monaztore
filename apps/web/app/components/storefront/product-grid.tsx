import type { ProductCard } from "@monaztore/core";
import { ImageIcon } from "lucide-react";
import { href, Link } from "react-router";
import { useT } from "~/lib/i18n";
import { Price } from "./price";

/** Products as cards: two per row on a phone, up to four on a wide screen. */
export function ProductGrid({ products, currency }: { products: ProductCard[]; currency: string }) {
  const t = useT();
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <li key={product.slug}>
          <Link
            to={href("/products/:slug", { slug: product.slug })}
            className="group grid gap-2 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt=""
                  width={600}
                  height={600}
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover"
                />
              ) : (
                <ImageIcon
                  aria-hidden
                  className="absolute inset-0 m-auto size-8 text-muted-foreground"
                />
              )}
              {!product.inStock ? (
                <span className="absolute top-2 left-2 rounded-full bg-background px-2 py-0.5 text-xs font-medium">
                  {t("storefront.soldOut")}
                </span>
              ) : product.compareAtPrice !== null &&
                product.price !== null &&
                product.compareAtPrice > product.price ? (
                <span className="absolute top-2 left-2 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                  {t("storefront.onSale")}
                </span>
              ) : null}
            </div>
            <span className="line-clamp-2 text-sm group-hover:underline">{product.name}</span>
            <Price
              price={product.price}
              compareAtPrice={product.compareAtPrice}
              currency={currency}
              className="text-sm"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
