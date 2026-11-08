import {
  activeFilterCount,
  type CatalogQuery,
  catalogParams,
  catalogSorts,
  OPTION_PARAM,
  withoutFilter,
} from "@monaztore/contracts/catalog-query";
import type { CatalogFacets, ProductPage, ThemeLayout } from "@monaztore/core";
import { SlidersHorizontalIcon, XIcon } from "lucide-react";
import { useId, useState } from "react";
import { Form, Link, useLocation, useNavigation, useSubmit } from "react-router";
import { Button, buttonVariants } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { ScrollShadow } from "~/components/ui/scroll-shadow";
import { useLocale, useT } from "~/lib/i18n";
import { formatPrice } from "~/lib/money";
import { cn } from "~/lib/utils";
import { Pagination } from "./pagination";
import { ProductGrid } from "./product-grid";

const FORM_ID = "catalog";

/**
 * A catalog page as the theme lays it out: the order and, when the theme has them, the filters
 * Amazon-style, beside the products from 1024 px and as a full-screen panel on the phone. It's a
 * GET form, so the URL is the state: every change reloads the list through the loader, and with
 * no JavaScript the "See results" button still works.
 */
export function CatalogView({
  page,
  facets,
  query,
  currency,
  layout,
  empty,
}: {
  page: ProductPage;
  facets: CatalogFacets | null;
  query: CatalogQuery;
  currency: string;
  layout: ThemeLayout["productCard"];
  /** What to say when there are no products at all (not because of a filter). */
  empty: string;
}) {
  const t = useT();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [open, setOpen] = useState(false);
  const filtersOn = activeFilterCount(query);
  // Each change shows its results right away; typing a price waits for "Apply".
  const onChange = (event: React.FormEvent<HTMLFormElement>) => {
    const target = event.target as HTMLInputElement;
    if (target.type === "number") return;
    submit(event.currentTarget, { preventScrollReset: true, replace: true });
  };
  return (
    <div className={cn(facets && "lg:grid lg:grid-cols-[15rem_1fr] lg:items-start lg:gap-10")}>
      <Form
        id={FORM_ID}
        method="get"
        preventScrollReset
        onChange={onChange}
        className={cn(!facets && "contents")}
      >
        {query.q ? <input type="hidden" name="q" value={query.q} /> : null}
        {facets ? (
          <FiltersPanel
            facets={facets}
            query={query}
            open={open}
            onClose={() => setOpen(false)}
            total={page.total}
          />
        ) : null}
      </Form>
      <div className={cn(navigation.state === "loading" && "opacity-60 transition-opacity")}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" role="status">
            {t("storefront.productCount", { count: page.total })}
          </p>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            {facets ? (
              <Button
                type="button"
                variant="outline"
                className="lg:hidden"
                aria-expanded={open}
                aria-controls="catalog-filters"
                onClick={() => setOpen(true)}
              >
                <SlidersHorizontalIcon aria-hidden className="size-4" />
                {filtersOn > 0
                  ? t("storefront.filtersActive", { count: String(filtersOn) })
                  : t("storefront.filters")}
              </Button>
            ) : null}
            <SortSelect query={query} />
          </div>
        </div>
        {facets ? <ActiveFilters query={query} currency={currency} /> : null}
        {page.products.length > 0 ? (
          <ProductGrid products={page.products} currency={currency} variant={layout} eager={2} />
        ) : (
          <p className="py-10 text-center text-muted-foreground">
            {filtersOn > 0 ? t("storefront.noMatches") : empty}
          </p>
        )}
        <Pagination page={page.page} pages={page.pages} />
      </div>
    </div>
  );
}

function SortSelect({ query }: { query: CatalogQuery }) {
  const t = useT();
  const submit = useSubmit();
  const id = useId();
  return (
    <div className="flex min-w-0 items-center gap-2">
      {/* On a phone the select says the order by itself; the label stays for screen readers. */}
      <Label
        htmlFor={id}
        className="sr-only text-sm whitespace-nowrap text-muted-foreground sm:not-sr-only"
      >
        {t("storefront.sortLabel")}
      </Label>
      <select
        id={id}
        name="sort"
        form={FORM_ID}
        defaultValue={query.sort}
        key={query.sort}
        onChange={(event) => {
          const form = event.currentTarget.form;
          if (form) submit(form, { preventScrollReset: true, replace: true });
        }}
        className="h-11 min-w-0 max-w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {catalogSorts.map((sort) => (
          <option key={sort} value={sort}>
            {t(`storefront.sort_${sort}`)}
          </option>
        ))}
      </select>
    </div>
  );
}

function FiltersPanel({
  facets,
  query,
  open,
  onClose,
  total,
}: {
  facets: CatalogFacets;
  query: CatalogQuery;
  open: boolean;
  onClose: () => void;
  total: number;
}) {
  const t = useT();
  const whole = (minor: number | null) => (minor === null ? "" : String(minor / 100));
  return (
    <aside
      id="catalog-filters"
      aria-label={t("storefront.filters")}
      className={cn(
        open ? "fixed inset-0 z-50 flex flex-col bg-background" : "hidden",
        "lg:sticky lg:top-4 lg:z-auto lg:flex lg:flex-col lg:bg-transparent",
      )}
    >
      <div className="flex items-center justify-between border-b px-4 py-2 lg:hidden">
        <h2 className="text-lg font-semibold">{t("storefront.filters")}</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("storefront.closeFilters")}
          onClick={onClose}
        >
          <XIcon aria-hidden className="size-5" />
        </Button>
      </div>
      <div className="grid flex-1 content-start gap-6 overflow-y-auto p-4 lg:overflow-visible lg:p-0">
        <h2 className="hidden font-heading text-lg font-semibold lg:block">
          {t("storefront.filters")}
        </h2>
        {facets.options.map((option) => {
          const selected = query.options[option.name] ?? [];
          // A value picked but no longer in the list still shows, so it can be taken off.
          const values = [
            ...option.values,
            ...selected
              .filter((value) => !option.values.some((v) => v.value === value))
              .map((value) => ({ value, count: 0 })),
          ];
          return (
            <fieldset key={option.name} className="grid gap-2">
              <legend className="mb-2 text-sm font-semibold">{option.name}</legend>
              <div className="flex flex-wrap gap-2">
                {values.map(({ value, count }) => (
                  <label key={value} className="relative">
                    <input
                      type="checkbox"
                      name={`${OPTION_PARAM}${option.name}`}
                      value={value}
                      defaultChecked={selected.includes(value)}
                      key={`${value}-${selected.includes(value)}`}
                      className="peer sr-only"
                    />
                    <span className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1 rounded-md border px-3 text-sm peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 hover:border-primary">
                      {value} <span className="text-xs opacity-80">({count})</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
        {facets.price ? (
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-semibold">{t("storefront.priceRange")}</legend>
            <div className="grid grid-cols-2 items-end gap-2">
              <div className="grid gap-1">
                <Label htmlFor="catalog-min" className="text-xs text-muted-foreground">
                  {t("storefront.priceMin")}
                </Label>
                <Input
                  id="catalog-min"
                  name="min"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  defaultValue={whole(query.minPrice)}
                  key={`min-${query.minPrice}`}
                  placeholder={String(Math.floor(facets.price.min / 100))}
                  className="h-11"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="catalog-max" className="text-xs text-muted-foreground">
                  {t("storefront.priceMax")}
                </Label>
                <Input
                  id="catalog-max"
                  name="max"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  defaultValue={whole(query.maxPrice)}
                  key={`max-${query.maxPrice}`}
                  placeholder={String(Math.ceil(facets.price.max / 100))}
                  className="h-11"
                />
              </div>
              <Button type="submit" variant="outline" className="col-span-2">
                {t("storefront.applyPrice")}
              </Button>
            </div>
          </fieldset>
        ) : null}
        <fieldset className="grid gap-1">
          <legend className="mb-2 text-sm font-semibold">{t("storefront.availability")}</legend>
          <Check name="stock" checked={query.inStock} count={facets.inStock}>
            {t("storefront.inStockOnly")}
          </Check>
          {facets.onSale > 0 || query.onSale ? (
            <Check name="sale" checked={query.onSale} count={facets.onSale}>
              {t("storefront.onSaleOnly")}
            </Check>
          ) : null}
        </fieldset>
      </div>
      <div className="border-t p-4 lg:hidden">
        <Button type="submit" className="w-full" onClick={onClose}>
          {t("storefront.showResults", { count: total })}
        </Button>
      </div>
    </aside>
  );
}

function Check({
  name,
  checked,
  count,
  children,
}: {
  name: string;
  checked: boolean;
  count: number;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center gap-3">
      <input
        id={id}
        type="checkbox"
        name={name}
        value="1"
        defaultChecked={checked}
        key={String(checked)}
        className="size-5 accent-primary"
      />
      <Label htmlFor={id} className="font-normal">
        {children} <span className="text-xs text-muted-foreground">({count})</span>
      </Label>
    </div>
  );
}

/** The filters on, as chips with an "×" each, and "Clear filters". */
function ActiveFilters({ query, currency }: { query: CatalogQuery; currency: string }) {
  const t = useT();
  const locale = useLocale();
  const { pathname } = useLocation();
  if (activeFilterCount(query) === 0) return null;
  const link = (next: CatalogQuery) => {
    const search = catalogParams(next).toString();
    return search ? `${pathname}?${search}` : pathname;
  };
  const price = (minor: number) => formatPrice(minor, currency, locale);
  const chips: { key: string; label: string; to: string }[] = [];
  if (query.minPrice !== null || query.maxPrice !== null) {
    chips.push({
      key: "price",
      label:
        query.minPrice !== null && query.maxPrice !== null
          ? t("storefront.priceBetween", { min: price(query.minPrice), max: price(query.maxPrice) })
          : query.minPrice !== null
            ? t("storefront.priceAtLeast", { min: price(query.minPrice) })
            : t("storefront.priceUpTo", { max: price(query.maxPrice ?? 0) }),
      to: link(withoutFilter(query, { kind: "price" })),
    });
  }
  for (const [name, values] of Object.entries(query.options)) {
    for (const value of values) {
      chips.push({
        key: `${name}:${value}`,
        label: `${name}: ${value}`,
        to: link(withoutFilter(query, { kind: "option", name, value })),
      });
    }
  }
  if (query.inStock) {
    chips.push({
      key: "stock",
      label: t("storefront.inStock"),
      to: link(withoutFilter(query, { kind: "stock" })),
    });
  }
  if (query.onSale) {
    chips.push({
      key: "sale",
      label: t("storefront.onSale"),
      to: link(withoutFilter(query, { kind: "sale" })),
    });
  }
  const chip =
    "inline-flex h-11 items-center gap-1 rounded-full border px-3 text-sm whitespace-nowrap outline-none hover:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50";
  return (
    <nav aria-label={t("storefront.activeFilters")} className="mb-4">
      <ScrollShadow scrollerClassName="overflow-x-auto">
        <ul className="flex w-max gap-2">
          {chips.map((item) => (
            <li key={item.key}>
              <Link
                to={item.to}
                preventScrollReset
                replace
                aria-label={t("storefront.removeFilter", { label: item.label })}
                className={chip}
              >
                {item.label}
                <XIcon aria-hidden className="size-4" />
              </Link>
            </li>
          ))}
          <li>
            <Link
              to={link({
                ...query,
                minPrice: null,
                maxPrice: null,
                inStock: false,
                onSale: false,
                options: {},
                page: 1,
              })}
              preventScrollReset
              replace
              className={buttonVariants({ variant: "link", className: "h-11" })}
            >
              {t("storefront.clearFilters")}
            </Link>
          </li>
        </ul>
      </ScrollShadow>
    </nav>
  );
}
