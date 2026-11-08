import type { StoreTheme } from "@monaztore/core";
import { SearchIcon, ShoppingBagIcon } from "lucide-react";
import type * as React from "react";
import { Form, href, Link, NavLink } from "react-router";
import { ThemeToggle } from "~/components/theme-toggle";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ScrollShadow } from "~/components/ui/scroll-shadow";
import { useT } from "~/lib/i18n";
import { cn } from "~/lib/utils";

export interface StoreShellProps {
  name: string;
  collections: { slug: string; name: string }[];
  /** The store's published pages, linked from the footer. */
  pages?: { slug: string; title: string }[];
  /** The store's theme (from core): its colors, logo and announcement. */
  theme?: Pick<StoreTheme, "id" | "style" | "logoUrl" | "announcement">;
  cartCount: number;
  children: React.ReactNode;
}

const chip =
  "inline-flex h-11 items-center rounded-full border px-4 text-sm whitespace-nowrap outline-none hover:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * The frame of every storefront page, painted with the store's theme: the announcement, the
 * logo (or the name), search, its collections as chips that scroll sideways on a phone, and the
 * footer. The theme's colors are CSS variables on the frame, so every token inside follows it.
 */
export function StoreShell({
  name,
  collections,
  pages = [],
  theme,
  cartCount,
  children,
}: StoreShellProps) {
  const t = useT();
  const search = (
    <Form
      method="get"
      action={href("/products")}
      role="search"
      className="order-last flex w-full gap-2 md:order-none md:w-auto md:max-w-xl md:flex-1"
    >
      <label htmlFor="store-search" className="sr-only">
        {t("storefront.searchLabel")}
      </label>
      <Input
        id="store-search"
        type="search"
        name="q"
        placeholder={t("storefront.searchPlaceholder")}
        className="h-11"
      />
      <Button type="submit" size="icon" aria-label={t("storefront.searchSubmit")}>
        <SearchIcon aria-hidden className="size-5" />
      </Button>
    </Form>
  );
  return (
    <div
      className="flex min-h-dvh flex-col"
      data-store-theme={theme?.id}
      style={theme?.style as React.CSSProperties | undefined}
    >
      {theme?.announcement ? (
        <p className="bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground">
          {theme.announcement}
        </p>
      ) : null}
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-3 px-4 py-3 md:flex-nowrap md:gap-6">
          <Link
            to={href("/")}
            className="mr-auto flex min-h-11 min-w-0 items-center rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:mr-0"
          >
            {theme?.logoUrl ? (
              <img
                src={theme.logoUrl}
                alt={name}
                height={40}
                width={160}
                decoding="async"
                className="h-10 w-auto max-w-40 object-contain"
              />
            ) : (
              <span className="truncate font-heading text-xl font-semibold tracking-tight">
                {name}
              </span>
            )}
          </Link>
          {search}
          <div className="flex items-center gap-1 md:ml-auto">
            <ThemeToggle />
            <Link
              to={href("/cart")}
              aria-label={t("storefront.cartWithCount", { count: cartCount })}
              className="relative inline-flex size-11 items-center justify-center rounded-md outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <ShoppingBagIcon aria-hidden className="size-5" />
              {cartCount > 0 ? (
                <span
                  aria-hidden
                  className="absolute top-1 right-1 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-xs font-medium text-primary-foreground"
                >
                  {cartCount}
                </span>
              ) : null}
            </Link>
          </div>
        </div>
        <nav aria-label={t("storefront.menu")} className="mx-auto max-w-6xl pb-3">
          <ScrollShadow scrollerClassName="overflow-x-auto">
            <ul className="flex w-max gap-2 px-4">
              <li>
                <NavLink
                  to={href("/products")}
                  className={({ isActive }) =>
                    cn(chip, isActive && "border-primary bg-primary text-primary-foreground")
                  }
                >
                  {t("storefront.allProducts")}
                </NavLink>
              </li>
              {collections.map((collection) => (
                <li key={collection.slug}>
                  <NavLink
                    to={href("/collections/:slug", { slug: collection.slug })}
                    className={({ isActive }) =>
                      cn(chip, isActive && "border-primary bg-primary text-primary-foreground")
                    }
                  >
                    {collection.name}
                  </NavLink>
                </li>
              ))}
            </ul>
          </ScrollShadow>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      <footer className="mt-10 border-t bg-muted">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 md:grid-cols-[1fr_auto]">
          <div className="grid content-start gap-2">
            <p className="font-heading text-lg font-semibold">{name}</p>
            <p className="text-sm text-muted-foreground">
              {t("storefront.footer", { year: String(new Date().getFullYear()), store: name })}
            </p>
          </div>
          {pages.length > 0 ? (
            <nav aria-label={t("storefront.pagesNav")}>
              <ul className="flex flex-wrap gap-x-2 md:grid md:justify-items-start">
                {pages.map((page) => (
                  <li key={page.slug}>
                    <Link
                      to={href("/*", { "*": page.slug })}
                      className="inline-flex min-h-11 items-center px-2 text-sm underline-offset-4 hover:underline md:px-0"
                    >
                      {page.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </div>
        <p className="mx-auto max-w-6xl px-4 pb-6 text-xs text-muted-foreground">
          {t("storefront.poweredBy")}
        </p>
      </footer>
    </div>
  );
}
