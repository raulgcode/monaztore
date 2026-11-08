import { SearchIcon } from "lucide-react";
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
  children: React.ReactNode;
}

const chip =
  "inline-flex h-11 items-center rounded-full border px-4 text-sm whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * The frame of every storefront page: the store's name, search, its collections as chips that
 * scroll sideways on a phone, and the footer.
 */
export function StoreShell({ name, collections, children }: StoreShellProps) {
  const t = useT();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3">
          <Link
            to={href("/")}
            className="mr-auto truncate rounded-md text-lg font-semibold tracking-tight outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {name}
          </Link>
          <ThemeToggle />
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-3">
          <Form method="get" action={href("/products")} role="search" className="flex gap-2">
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
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-4 py-6 text-sm text-muted-foreground">
          <p>{t("storefront.footer", { year: String(new Date().getFullYear()), store: name })}</p>
          <p>{t("storefront.poweredBy")}</p>
        </div>
      </footer>
    </div>
  );
}
