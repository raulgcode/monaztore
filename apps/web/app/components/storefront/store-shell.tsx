import type { StoreMenuItem } from "@monaztore/contracts";
import type { StoreTheme } from "@monaztore/core";
import { localeNames, locales } from "@monaztore/i18n";
import { ChevronDownIcon, GlobeIcon, MenuIcon, ShoppingBagIcon, XIcon } from "lucide-react";
import type * as React from "react";
import { useEffect, useRef } from "react";
import { Form, href, Link, NavLink, useLocation } from "react-router";
import { NavigationProgress } from "~/components/navigation-progress";
import { ThemeToggle } from "~/components/theme-toggle";
import { ScrollShadow } from "~/components/ui/scroll-shadow";
import { useLocale, useT } from "~/lib/i18n";
import { cn } from "~/lib/utils";
import { StoreSearch } from "./store-search";

export interface StoreShellProps {
  name: string;
  collections: { slug: string; name: string }[];
  /** The store's published pages, linked from the footer. */
  pages?: { slug: string; title: string }[];
  /** The store's theme (from core): its colors, logo and announcement. */
  theme?: Pick<
    StoreTheme,
    | "id"
    | "style"
    | "logoUrl"
    | "announcement"
    | "menu"
    | "footerMenu"
    | "categoryChips"
    | "categoriesMenu"
    | "categoriesLabel"
  >;
  cartCount: number;
  /** The store's currency, for the prices in the search box's suggestions. */
  currency: string;
  children: React.ReactNode;
}

const chip =
  "inline-flex h-11 items-center rounded-full border px-4 text-sm whitespace-nowrap outline-none hover:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * The frame of every storefront page, painted with the store's theme: the announcement, the
 * logo (or the name), search, the store's menu (a drawer on the phone, a row with a categories
 * panel from 768 px), its categories as chips when the store wants them, and the footer. The theme's colors are CSS variables on the frame, so every token inside follows it.
 */
export function StoreShell({
  name,
  collections,
  pages = [],
  theme,
  cartCount,
  currency,
  children,
}: StoreShellProps) {
  const t = useT();
  const categoriesLabel = theme?.categoriesLabel || t("storefront.categories");
  // The store's own menu; without one, the whole catalog (and the categories, beside it).
  const menu: StoreMenuItem[] = theme?.menu?.length
    ? theme.menu
    : [{ label: t("storefront.allProducts"), href: href("/products"), children: [] }];
  // The footer's own links; without them, the store's published pages.
  const footer = theme?.footerMenu?.length
    ? theme.footerMenu
    : pages.map((page) => ({ label: page.title, href: `/${page.slug}` }));
  const categories = theme?.categoriesMenu === false ? [] : collections;
  return (
    <div
      // A page with its main action fixed at the bottom of the phone leaves room for it.
      className="flex min-h-dvh flex-col bg-background text-foreground has-[[data-sticky-action]]:pb-24 md:has-[[data-sticky-action]]:pb-0"
      data-store-theme={theme?.id}
      style={theme?.style as React.CSSProperties | undefined}
    >
      <NavigationProgress scope="store" />
      {theme?.announcement ? (
        <p className="bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground">
          {theme.announcement}
        </p>
      ) : null}
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-3 px-4 py-3 md:flex-nowrap md:gap-6">
          <MobileMenu
            name={name}
            menu={menu}
            collections={categories}
            categoriesLabel={categoriesLabel}
            footer={footer}
          />
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
          <StoreSearch
            currency={currency}
            className="order-last w-full md:order-none md:w-auto md:max-w-xl md:flex-1"
          />
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
        <nav
          aria-label={t("storefront.menu")}
          className="mx-auto hidden max-w-6xl items-center gap-1 px-2 pb-2 md:flex"
        >
          {menu.map((item) =>
            item.children.length > 0 ? (
              <SubMenu key={`${item.label}-${item.href}`} item={item} />
            ) : (
              <MenuLink key={`${item.label}-${item.href}`} item={item} />
            ),
          )}
          {categories.length > 0 ? (
            <CategoriesMenu collections={categories} label={categoriesLabel} />
          ) : null}
        </nav>
        {theme?.categoryChips && collections.length > 0 ? (
          <nav aria-label={categoriesLabel} className="mx-auto max-w-6xl pb-3">
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
        ) : null}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      <footer className="mt-10 border-t bg-background">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 md:grid-cols-[1fr_auto]">
          <div className="grid content-start gap-2">
            <p className="font-heading text-lg font-semibold">{name}</p>
            <p className="text-sm text-muted-foreground">
              {t("storefront.footer", { year: String(new Date().getFullYear()), store: name })}
            </p>
          </div>
          {footer.length > 0 ? (
            <nav aria-label={t("storefront.pagesNav")}>
              <ul className="flex flex-wrap gap-x-2 md:grid md:justify-items-start">
                {footer.map((link) => (
                  <li key={`${link.label}-${link.href}`}>
                    <PlainLink
                      href={link.href}
                      className="inline-flex min-h-11 items-center px-2 text-sm underline-offset-4 hover:underline md:px-0"
                    >
                      {link.label}
                    </PlainLink>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </div>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 pb-6">
          <StoreLanguage />
          <p className="text-xs text-muted-foreground">{t("storefront.poweredBy")}</p>
        </div>
      </footer>
    </div>
  );
}

/**
 * The store speaks the language its owner picked; a shopper who reads another switches here, and
 * the store remembers it on this device. Each language is named in itself.
 */
function StoreLanguage() {
  const t = useT();
  const locale = useLocale();
  const location = useLocation();
  return (
    <Form method="post" action={href("/locale")} className="flex items-center gap-1">
      <input type="hidden" name="redirectTo" value={location.pathname + location.search} />
      <GlobeIcon aria-hidden className="size-4 text-muted-foreground" />
      <span className="sr-only">{t("common.languageLegend")}</span>
      {locales.map((option) => (
        <button
          key={option}
          type="submit"
          name="locale"
          value={option}
          lang={option}
          aria-current={option === locale ? "true" : undefined}
          className="inline-flex min-h-11 items-center rounded-md px-2 text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-[current]:font-semibold aria-[current]:text-foreground"
        >
          {localeNames[option]}
        </button>
      ))}
    </Form>
  );
}

const ownPath = (value: string) => value.startsWith("/") && !value.startsWith("//");

/** A link of the store's: its own addresses client-side, anything else as a plain link. */
function PlainLink({
  href: to,
  className,
  children,
}: {
  href: string;
  className: string;
  children: React.ReactNode;
}) {
  if (ownPath(to)) {
    return (
      <Link to={to} className={className}>
        {children}
      </Link>
    );
  }
  const external = /^https?:/i.test(to);
  return (
    <a href={to} className={className} {...(external ? { rel: "noopener", target: "_blank" } : {})}>
      {children}
    </a>
  );
}

/** From 768 px, a menu link with links under it: a panel that opens on a tap, not on hover. */
function SubMenu({ item }: { item: StoreMenuItem }) {
  const t = useT();
  const ref = useClosingDetails(true);
  return (
    <details ref={ref} className="group relative">
      <summary
        className={cn(
          summaryReset,
          "inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-sm font-medium outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
        )}
      >
        {item.label}
        <ChevronDownIcon
          aria-hidden
          className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <ul className="absolute top-full left-0 z-50 mt-2 grid min-w-56 gap-1 rounded-xl border bg-popover p-2 text-popover-foreground shadow-lg">
        <li>
          <PlainLink
            href={item.href}
            className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {t("storefront.seeAllOf", { name: item.label })}
          </PlainLink>
        </li>
        {item.children.map((child) => (
          <li key={`${child.label}-${child.href}`}>
            <PlainLink
              href={child.href}
              className="flex min-h-11 items-center rounded-md px-3 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {child.label}
            </PlainLink>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** A menu link: the store's own pages client-side, anything else as a plain link. */
function MenuLink({
  item,
  large = false,
}: {
  item: { label: string; href: string };
  large?: boolean;
}) {
  const className = cn(
    "inline-flex items-center rounded-md px-3 font-medium outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
    large ? "min-h-12 w-full text-lg" : "min-h-11 text-sm",
  );
  if (!ownPath(item.href)) {
    const external = /^https?:/i.test(item.href);
    return (
      <a
        href={item.href}
        className={className}
        {...(external ? { rel: "noopener", target: "_blank" } : {})}
      >
        {item.label}
      </a>
    );
  }
  return (
    <NavLink
      to={item.href}
      end
      className={({ isActive }) => cn(className, isActive && "text-primary")}
    >
      {item.label}
    </NavLink>
  );
}

/** Closes a <details> when the page changes or, with `outside`, on a tap elsewhere. */
function useClosingDetails(outside: boolean) {
  const ref = useRef<HTMLDetailsElement>(null);
  const location = useLocation();
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [location.pathname, location.search]);
  useEffect(() => {
    if (!outside) return;
    const onClick = (event: MouseEvent) => {
      const details = ref.current;
      if (details?.open && !details.contains(event.target as Node)) details.open = false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [outside]);
  return ref;
}

const summaryReset = "cursor-pointer list-none [&::-webkit-details-marker]:hidden";

/** From 768 px: the categories in a panel under the menu, with a way to all of them. */
function CategoriesMenu({
  collections,
  label,
}: {
  collections: { slug: string; name: string }[];
  label: string;
}) {
  const t = useT();
  const ref = useClosingDetails(true);
  return (
    <details ref={ref} className="group relative">
      <summary
        className={cn(
          summaryReset,
          "inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-sm font-medium outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
        )}
      >
        {label}
        <ChevronDownIcon
          aria-hidden
          className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="absolute top-full left-0 z-50 mt-2 grid w-[min(42rem,90vw)] gap-3 rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg">
        <ul className="grid grid-cols-2 gap-1 lg:grid-cols-3">
          {collections.map((collection) => (
            <li key={collection.slug}>
              <Link
                to={href("/collections/:slug", { slug: collection.slug })}
                className="flex min-h-11 items-center rounded-md px-3 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {collection.name}
              </Link>
            </li>
          ))}
        </ul>
        <Link
          to={href("/collections")}
          className="inline-flex min-h-11 items-center justify-self-start px-3 text-sm font-medium text-link underline-offset-4 hover:underline"
        >
          {t("storefront.allCategories")}
        </Link>
      </div>
    </details>
  );
}

/**
 * On the phone, the menu is a drawer from the left: the store's links, its categories and its
 * pages, in reach of the thumb. A <details>, so it opens without JavaScript too.
 */
function MobileMenu({
  name,
  menu,
  collections,
  categoriesLabel,
  footer,
}: {
  name: string;
  menu: StoreMenuItem[];
  collections: { slug: string; name: string }[];
  categoriesLabel: string;
  footer: { label: string; href: string }[];
}) {
  const t = useT();
  const ref = useClosingDetails(false);
  const close = () => {
    if (ref.current) ref.current.open = false;
  };
  return (
    <details ref={ref} className="md:hidden">
      <summary
        aria-label={t("storefront.openMenu")}
        className={cn(
          summaryReset,
          "-ml-2 inline-flex size-11 items-center justify-center rounded-md outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
        )}
      >
        <MenuIcon aria-hidden className="size-6" />
      </summary>
      <div className="fixed inset-0 z-50 flex">
        <div className="grid h-full w-[min(22rem,88vw)] content-start gap-6 overflow-y-auto bg-background p-4 shadow-xl">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-heading text-lg font-semibold">{name}</p>
            <button
              type="button"
              onClick={close}
              aria-label={t("storefront.closeMenu")}
              className="inline-flex size-11 items-center justify-center rounded-md outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <XIcon aria-hidden className="size-5" />
            </button>
          </div>
          <nav aria-label={t("storefront.menu")}>
            <ul className="grid gap-1">
              {menu.map((item) => (
                <li key={`${item.label}-${item.href}`}>
                  <MenuLink item={item} large />
                  {item.children.length > 0 ? (
                    <ul className="ml-3 grid gap-1 border-l pl-2">
                      {item.children.map((child) => (
                        <li key={`${child.label}-${child.href}`}>
                          <MenuLink item={child} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </nav>
          {collections.length > 0 ? (
            <nav aria-label={categoriesLabel} className="grid gap-2">
              <p className="px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {categoriesLabel}
              </p>
              <ul className="grid grid-cols-2 gap-1">
                {collections.map((collection) => (
                  <li key={collection.slug}>
                    <Link
                      to={href("/collections/:slug", { slug: collection.slug })}
                      className="flex min-h-11 items-center rounded-md px-3 text-sm outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      {collection.name}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                to={href("/collections")}
                className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-link underline-offset-4 hover:underline"
              >
                {t("storefront.allCategories")}
              </Link>
            </nav>
          ) : null}
          {footer.length > 0 ? (
            <nav aria-label={t("storefront.pagesNav")} className="grid gap-1 border-t pt-4">
              {footer.map((link) => (
                <PlainLink
                  key={`${link.label}-${link.href}`}
                  href={link.href}
                  className="flex min-h-11 items-center rounded-md px-3 text-sm outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {link.label}
                </PlainLink>
              ))}
            </nav>
          ) : null}
        </div>
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={close}
          className="flex-1 bg-scrim/50"
        />
      </div>
    </details>
  );
}
