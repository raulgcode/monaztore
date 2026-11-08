import type { ProductCard, ThemeLayout } from "@monaztore/core";
import { ImageIcon } from "lucide-react";
import { href, Link } from "react-router";
import { useT } from "~/lib/i18n";
import { photoSrc, photoSrcSet } from "~/lib/media";
import { percentOff } from "~/lib/money";
import { cn } from "~/lib/utils";
import { Price } from "./price";

type Variant = ThemeLayout["productCard"];

/** Two per row on a phone, three from 640 px, four (about 280 px each) on a wide screen. */
const gridSizes = "(min-width: 1024px) 280px, (min-width: 640px) 33vw, 50vw";
/** Values of the first option shown on a card; the rest are counted ("+3"). */
const OPTION_VALUES_SHOWN = 5;

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
    <ul className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4">
      {products.map((product, index) => (
        <li key={product.slug}>
          <Card
            product={product}
            currency={currency}
            variant={variant}
            eager={index < eager}
            priority={index === 0 && eager > 0}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * One product in the grid: its photo (the second one shows when a pointer rests on it), what
 * is taken off when it is on sale, the name, the price and the first option's values ("S · M ·
 * L"), so a shopper sees at a glance whether their size is there.
 */
function Card({
  product,
  currency,
  variant,
  eager,
  priority,
}: {
  product: ProductCard;
  currency: string;
  variant: Variant;
  eager: boolean;
  priority: boolean;
}) {
  const t = useT();
  const option = product.firstOption;
  const shown = option?.values.slice(0, OPTION_VALUES_SHOWN) ?? [];
  return (
    <Link
      to={href("/products/:slug", { slug: product.slug })}
      className="group grid gap-3 rounded-[var(--radius)] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-4 focus-visible:ring-offset-background"
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-[var(--radius)] bg-muted",
          variant === "portrait" ? "aspect-[4/5]" : "aspect-square",
        )}
      >
        <Photo product={product} eager={eager} priority={priority} />
        {product.hoverImageUrl && product.inStock ? (
          <img
            src={photoSrc(product.hoverImageUrl, 480)}
            srcSet={photoSrcSet(product.hoverImageUrl, [320, 480, 640])}
            sizes={gridSizes}
            alt=""
            width={600}
            height={variant === "portrait" ? 750 : 600}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100 motion-reduce:transition-none"
          />
        ) : null}
        <Badge product={product} />
      </div>
      <div className="grid gap-1 px-0.5">
        <span
          className={cn(
            "line-clamp-2 text-sm leading-snug font-medium underline-offset-4 group-hover:underline",
            variant === "portrait" && "md:text-base",
          )}
        >
          {product.name}
        </span>
        <Price
          price={product.price}
          compareAtPrice={product.compareAtPrice}
          currency={currency}
          className="text-sm md:text-base"
        />
        {option && shown.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            <span className="sr-only">{`${option.name}: `}</span>
            {shown.join(" · ")}
            {option.values.length > shown.length
              ? ` ${t("storefront.moreValues", { count: String(option.values.length - shown.length) })}`
              : null}
          </span>
        ) : null}
      </div>
    </Link>
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
      src={small ? photoSrc(product.imageUrl, 160) : photoSrc(product.imageUrl, 480)}
      srcSet={small ? undefined : photoSrcSet(product.imageUrl, [320, 480, 640])}
      sizes={small ? undefined : gridSizes}
      alt=""
      width={small ? 160 : 600}
      height={small ? 160 : 600}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      className={cn(
        "size-full object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none",
        !product.inStock && "opacity-60 grayscale",
      )}
    />
  );
}

function Badge({ product }: { product: ProductCard }) {
  const t = useT();
  if (!product.inStock) {
    return (
      <span className="absolute top-2 left-2 rounded-sm bg-foreground px-2 py-1 text-xs font-semibold tracking-wide text-background uppercase">
        {t("storefront.soldOut")}
      </span>
    );
  }
  const percent = percentOff(product.price, product.compareAtPrice);
  if (percent === null) return null;
  return (
    <span className="absolute top-2 left-2 rounded-sm bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground">
      <span aria-hidden>{t("storefront.percentBadge", { percent: String(percent) })}</span>
      <span className="sr-only">{t("storefront.percentOff", { percent: String(percent) })}</span>
    </span>
  );
}
