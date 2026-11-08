import type { ProductCard, ThemeLayout } from "@monaztore/core";
import { ImageIcon } from "lucide-react";
import { href, Link } from "react-router";
import { useT } from "~/lib/i18n";
import { cn } from "~/lib/utils";
import { Price } from "./price";

type Variant = ThemeLayout["productCard"];

/**
 * Products as the store's theme shows them: square or tall (4:5, for clothes) cards, two per
 * row on a phone and up to four on a wide screen, or a dense list with the code for stores that
 * sell by catalog. `eager` photos load first: the top of a catalog is the page's largest paint.
 */
export function ProductGrid({
  products,
  currency,
  variant = "square",
  eager = 0,
}: {
  products: ProductCard[];
  currency: string;
  variant?: Variant;
  eager?: number;
}) {
  if (variant === "row")
    return <ProductRows products={products} currency={currency} eager={eager} />;
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product, index) => (
        <li key={product.slug}>
          <Link
            to={href("/products/:slug", { slug: product.slug })}
            className="group grid gap-2 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <div
              className={cn(
                "relative overflow-hidden rounded-md bg-muted",
                variant === "portrait" ? "aspect-[4/5]" : "aspect-square",
              )}
            >
              <Photo product={product} eager={index < eager} priority={index === 0 && eager > 0} />
              <Badge product={product} />
            </div>
            <span
              className={cn(
                "line-clamp-2 text-sm group-hover:underline",
                variant === "portrait" && "font-medium",
              )}
            >
              {product.name}
            </span>
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

function ProductRows({
  products,
  currency,
  eager,
}: {
  products: ProductCard[];
  currency: string;
  eager: number;
}) {
  const t = useT();
  return (
    <ul className="grid divide-y rounded-md border bg-card">
      {products.map((product, index) => (
        <li key={product.slug}>
          <Link
            to={href("/products/:slug", { slug: product.slug })}
            className="group flex items-center gap-3 p-3 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 hover:bg-accent sm:gap-4"
          >
            <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-muted sm:size-20">
              <Photo product={product} eager={index < eager} priority={false} small />
            </div>
            <div className="grid min-w-0 flex-1 gap-1">
              <span className="line-clamp-2 text-sm font-medium group-hover:underline">
                {product.name}
              </span>
              <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                {product.sku ? <span>{t("storefront.sku", { sku: product.sku })}</span> : null}
                <span className={product.inStock ? undefined : "font-medium text-destructive"}>
                  {product.inStock ? t("storefront.inStock") : t("storefront.soldOut")}
                </span>
              </span>
            </div>
            <Price
              price={product.price}
              compareAtPrice={product.compareAtPrice}
              currency={currency}
              className="shrink-0 flex-col items-end text-right text-sm"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Photo({
  product,
  eager,
  priority,
  small = false,
}: {
  product: ProductCard;
  eager: boolean;
  priority: boolean;
  small?: boolean;
}) {
  if (!product.imageUrl) {
    return (
      <ImageIcon aria-hidden className="absolute inset-0 m-auto size-8 text-muted-foreground" />
    );
  }
  return (
    <img
      src={product.imageUrl}
      alt=""
      width={small ? 160 : 600}
      height={small ? 160 : 600}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
    />
  );
}

function Badge({ product }: { product: ProductCard }) {
  const t = useT();
  if (!product.inStock) {
    return (
      <span className="absolute top-2 left-2 rounded-full bg-background px-2 py-0.5 text-xs font-medium">
        {t("storefront.soldOut")}
      </span>
    );
  }
  if (
    product.compareAtPrice !== null &&
    product.price !== null &&
    product.compareAtPrice > product.price
  ) {
    return (
      <span className="absolute top-2 left-2 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
        {t("storefront.onSale")}
      </span>
    );
  }
  return null;
}
