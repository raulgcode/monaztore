import type { ProductCard, StoreTheme } from "@monaztore/core";
import { ArrowRightIcon, CheckIcon } from "lucide-react";
import type * as React from "react";
import { useId } from "react";
import { href, Link } from "react-router";
import { Illustration } from "~/components/pages/illustrations";
import { buttonVariants } from "~/components/ui/button";
import { useT } from "~/lib/i18n";
import { useStoreHighlights, useStoreShell } from "~/lib/store-theme";
import { cn } from "~/lib/utils";
import { type HeroAction, HeroPanel, heroButton, SmartLink } from "./hero-panel";
import { ProductGrid } from "./product-grid";

export interface StoreHomeProps {
  storeName: string;
  currency: string;
  products: ProductCard[];
  total: number;
  sale: ProductCard[];
}

/**
 * A store's front page, laid out by its theme: the hero (banner, spotlight or compact), then the
 * theme's sections in order. Only the hero's photo loads eagerly; it is the page's largest paint.
 */
export function StoreHome({ storeName, currency, products, total, sale }: StoreHomeProps) {
  const t = useT();
  const shell = useStoreShell();
  const highlights = useStoreHighlights();
  if (!shell) return null;
  const { theme, collections } = shell;
  const { layout } = theme;
  const title = theme.heroTitle || storeName;
  const subtitle = theme.heroSubtitle || t(`storefront.heroSubtitle_${theme.id}`);

  const sections: Record<StoreTheme["layout"]["sections"][number], React.ReactNode> = {
    highlights: theme.hideHighlights ? null : <Highlights key="highlights" items={highlights} />,
    collections:
      collections.length > 0 ? (
        <Collections
          key="collections"
          collections={collections}
          layout={layout}
          heading={theme.categoriesLabel || t("storefront.shopCollections")}
        />
      ) : null,
    new: (
      <Section
        key="new"
        heading={products.length > 0 ? t("storefront.newArrivals") : undefined}
        more={total > products.length ? href("/products") : undefined}
      >
        {products.length > 0 ? (
          <ProductGrid products={products} currency={currency} variant={layout.productCard} />
        ) : (
          <p className="py-10 text-center text-muted-foreground">{t("storefront.noProducts")}</p>
        )}
      </Section>
    ),
    sale:
      sale.length > 0 ? (
        <Section
          key="sale"
          heading={t("storefront.onSaleHeading")}
          more={`${href("/products")}?sale=1`}
        >
          <ProductGrid products={sale} currency={currency} variant={layout.productCard} />
        </Section>
      ) : null,
  };

  const action = {
    label:
      theme.heroButtonLabel ||
      (layout.hero === "compact" ? t("storefront.viewCatalog") : t("storefront.shopNow")),
    href: theme.heroButtonHref || href("/products"),
  };
  // A cover that leads elsewhere (a promotion, a landing) still offers the whole catalog.
  const secondary =
    theme.heroButtonHref && theme.heroButtonHref !== href("/products")
      ? { label: t("storefront.viewCatalog"), href: href("/products") }
      : null;

  return (
    <div className="grid gap-12 md:gap-16">
      {theme.hideHero ? (
        <h1 className="sr-only">{storeName}</h1>
      ) : (
        <Hero
          variant={layout.hero}
          title={title}
          subtitle={subtitle}
          eyebrow={theme.heroEyebrow || (theme.heroTitle ? storeName : undefined)}
          imageUrl={theme.heroImageUrl}
          smallImageUrl={theme.heroImageSmallUrl}
          illustration={theme.heroIllustration}
          action={action}
          secondary={secondary}
        />
      )}
      {layout.sections.map((section) => sections[section])}
    </div>
  );
}

function Hero({
  variant,
  title,
  subtitle,
  eyebrow,
  imageUrl,
  smallImageUrl,
  illustration,
  action,
  secondary,
}: {
  variant: StoreTheme["layout"]["hero"];
  title: string;
  subtitle: string;
  eyebrow?: string;
  imageUrl: string | null;
  /** The same photo at 720 px: phones take it from `srcSet`. */
  smallImageUrl: string | null;
  illustration: StoreTheme["heroIllustration"];
  action: HeroAction;
  secondary: HeroAction | null;
}) {
  // A photo with the title over it, full width: fashion and lifestyle stores.
  if (variant === "spotlight" && imageUrl) {
    return (
      <section className="relative -mx-4 overflow-hidden sm:mx-0 sm:rounded-3xl">
        <img
          src={imageUrl}
          srcSet={smallImageUrl ? `${smallImageUrl} 720w, ${imageUrl} 1600w` : undefined}
          sizes={smallImageUrl ? "(min-width: 1152px) 72rem, 100vw" : undefined}
          alt=""
          width={1600}
          height={1000}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className="aspect-[4/5] w-full bg-muted object-cover sm:aspect-[16/9] lg:aspect-[21/9]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-scrim/85 via-scrim/35 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 grid justify-items-start gap-4 p-6 text-on-scrim md:p-12">
          {eyebrow ? <p className="text-sm tracking-[0.2em] uppercase">{eyebrow}</p> : null}
          <h1 className="max-w-2xl font-heading text-4xl leading-tight font-bold md:text-6xl">
            {title}
          </h1>
          <p className="max-w-xl text-base md:text-lg">{subtitle}</p>
          <SmartLink
            href={action.href}
            className={cn(
              heroButton.primary,
              "bg-background text-foreground hover:bg-background/90",
            )}
          >
            {action.label}
            <ArrowRightIcon aria-hidden className="size-4" />
          </SmartLink>
        </div>
      </section>
    );
  }

  // A short band: catalogs and wholesale, where the products come first.
  if (variant === "compact") {
    return (
      <section className="flex items-center gap-6 rounded-2xl border bg-card p-5 md:p-8">
        <div className="grid flex-1 justify-items-start gap-3">
          {eyebrow ? (
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="font-heading text-2xl font-bold tracking-tight md:text-4xl">{title}</h1>
          <p className="max-w-2xl text-muted-foreground">{subtitle}</p>
          <SmartLink href={action.href} className={buttonVariants({ size: "lg" })}>
            {action.label}
            <ArrowRightIcon aria-hidden className="size-4" />
          </SmartLink>
        </div>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            width={1600}
            height={1000}
            loading="eager"
            decoding="async"
            className="hidden aspect-[4/3] w-56 rounded-xl object-cover sm:block md:w-80"
          />
        ) : illustration ? (
          <Illustration id={illustration} className="hidden w-56 sm:block md:w-72" />
        ) : null}
      </section>
    );
  }

  return (
    <HeroPanel
      eyebrow={eyebrow}
      title={title}
      text={subtitle}
      imageUrl={imageUrl}
      smallImageUrl={smallImageUrl}
      illustration={illustration}
      action={action}
      secondary={secondary}
    />
  );
}

export function Highlights({ items }: { items: string[] }) {
  const t = useT();
  return (
    <section aria-label={t("storefront.highlightsLabel")}>
      <ul className="grid divide-y rounded-2xl border bg-card sm:auto-cols-fr sm:grid-flow-col sm:divide-x sm:divide-y-0">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-3 px-4 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
              <CheckIcon aria-hidden className="size-5" />
            </span>
            <span className="text-sm font-medium">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Collections({
  collections,
  layout,
  heading,
  limit = 8,
}: {
  collections: { slug: string; name: string; imageUrl: string | null }[];
  layout: Pick<StoreTheme["layout"], "productCard">;
  heading?: string;
  limit?: number;
}) {
  const shown = collections.slice(0, limit);
  const withPhotos = layout.productCard !== "row" && shown.some((c) => c.imageUrl);
  return (
    <Section heading={heading}>
      {withPhotos ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((collection) => (
            <li key={collection.slug}>
              <Link
                to={href("/collections/:slug", { slug: collection.slug })}
                className={cn(
                  "group relative grid overflow-hidden rounded-lg bg-accent outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  layout.productCard === "portrait" ? "aspect-[4/5]" : "aspect-square",
                )}
              >
                {collection.imageUrl ? (
                  <>
                    <img
                      src={collection.imageUrl}
                      alt=""
                      width={600}
                      height={600}
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
                    />
                    <span className="absolute inset-0 bg-gradient-to-t from-scrim/80 to-transparent" />
                    <span className="relative self-end p-3 font-heading text-lg font-semibold text-on-scrim">
                      {collection.name}
                    </span>
                  </>
                ) : (
                  <span className="place-self-center p-3 text-center font-heading text-lg font-semibold text-accent-foreground">
                    {collection.name}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((collection) => (
            <li key={collection.slug}>
              <Link
                to={href("/collections/:slug", { slug: collection.slug })}
                className="flex min-h-14 items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3 text-sm font-medium outline-none hover:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {collection.name}
                <ArrowRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Section({
  heading,
  more,
  children,
}: {
  heading?: string;
  more?: string;
  children: React.ReactNode;
}) {
  const t = useT();
  const id = useId();
  return (
    <section className="grid gap-4" aria-labelledby={heading ? id : undefined}>
      {heading ? (
        <div className="flex items-end justify-between gap-4">
          <h2 id={id} className="font-heading text-xl font-semibold tracking-tight md:text-2xl">
            {heading}
          </h2>
          {more ? (
            <Link
              to={more}
              className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-link underline-offset-4 hover:underline"
            >
              {t("storefront.seeMore")}
              <ArrowRightIcon aria-hidden className="size-4" />
            </Link>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
