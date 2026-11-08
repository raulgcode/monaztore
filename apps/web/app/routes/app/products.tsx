import { parseWithZod } from "@conform-to/zod/v4";
import {
  bulkProductsSchema,
  type ProductListQuery,
  productSorts,
  productStockFilters,
  readProductListQuery,
} from "@monaztore/contracts";
import { bulkUpdateProducts, catalogSettings, listCategories, listProducts } from "@monaztore/core";
import { ImageIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { data, Form, href, Link, useFetcher, useLocation, useSubmit } from "react-router";
import { AdminPagination } from "~/components/admin/pagination";
import { PageHeader } from "~/components/page-header";
import { CatalogTabs } from "~/components/products/catalog-tabs";
import { ProductStatusBadge } from "~/components/products/product-status";
import { Button, buttonVariants } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { ScrollShadow } from "~/components/ui/scroll-shadow";
import { tenantContext } from "~/context";
import { metaT, useLocale, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { formatPrice } from "~/lib/money";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/products";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("products.title") }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = context.get(tenantContext);
  const query = readProductListQuery(new URL(request.url).searchParams);
  const [list, categories, settings] = await Promise.all([
    listProducts(tenant, query),
    listCategories(tenant),
    catalogSettings(tenant),
  ]);
  return {
    ...list,
    query,
    categories: categories.map(({ id, name, parentId }) => ({
      id,
      name,
      child: parentId !== null,
    })),
    currency: settings.currency,
    i18n: translations(context, "products", "admin"),
  };
}

/** The bulk bar: one action on every product selected. */
export async function action({ request, context }: Route.ActionArgs) {
  const tenant = context.get(tenantContext);
  const submission = parseWithZod(await request.formData(), { schema: bulkProductsSchema });
  if (submission.status !== "success") {
    return data({ done: null, count: 0, result: submission.reply() }, { status: 400 });
  }
  const count = await bulkUpdateProducts(tenant, submission.value);
  return { done: submission.value.action, count, result: submission.reply({ resetForm: true }) };
}

const statuses = ["all", "active", "draft", "archived"] as const;

export default function Products({ loaderData, params }: Route.ComponentProps) {
  const t = useT();
  const locale = useLocale();
  const { products, query, counts, page, pages, total, categories, currency } = loaderData;
  const { pathname, search } = useLocation();
  const submit = useSubmit();
  const [selected, setSelected] = useState<string[]>([]);
  const bulk = useFetcher<typeof action>({ key: BULK });
  const clear = useCallback(() => setSelected([]), []);
  // Once a change is applied the list reloads with it and the selection empties, once per
  // answer: the bar mounts again for the next selection with the last answer still there.
  const handled = useRef<unknown>(null);
  useEffect(() => {
    if (bulk.state === "idle" && bulk.data?.done && handled.current !== bulk.data) {
      handled.current = bulk.data;
      setSelected([]);
    }
  }, [bulk.state, bulk.data]);
  const editor = (productId: string) =>
    href("/app/:workspace/products/:productId", { workspace: params.workspace, productId });
  const withStatus = (status: (typeof statuses)[number]) => {
    const next = new URLSearchParams(search);
    next.delete("page");
    if (status === "all") next.delete("status");
    else next.set("status", status);
    return next.size ? `${pathname}?${next}` : pathname;
  };
  const filtered = query.q !== "" || query.stock !== "all" || query.category !== "";
  const allOnPage = products.length > 0 && products.every((p) => selected.includes(p.id));
  const toggle = (id: string, on: boolean) =>
    setSelected((current) =>
      on ? [...new Set([...current, id])] : current.filter((x) => x !== id),
    );

  return (
    <>
      <PageHeader title={t("products.title")} description={t("products.intro")}>
        <Link to={editor("new")} className={buttonVariants({ className: "w-full sm:w-auto" })}>
          <PlusIcon aria-hidden className="size-4" />
          {t("products.newProduct")}
        </Link>
      </PageHeader>
      <CatalogTabs workspace={params.workspace} />
      <div aria-live="polite">
        {bulk.state === "idle" && bulk.data?.done ? (
          <p role="status" className="mb-4 rounded-md border p-3 text-sm">
            {t(`products.done_${bulk.data.done}`, { count: bulk.data.count })}
          </p>
        ) : null}
      </div>

      <Form
        method="get"
        role="search"
        className="mb-3 grid gap-3 sm:grid-cols-[1fr_auto]"
        onChange={(event) => {
          // A filter applies as soon as it's picked; the search box waits for its button.
          if ((event.target as HTMLElement).tagName === "SELECT") submit(event.currentTarget);
        }}
      >
        {query.status !== "all" ? <input type="hidden" name="status" value={query.status} /> : null}
        <div className="grid gap-2">
          <Label htmlFor="product-search" className="sr-only">
            {t("products.searchLabel")}
          </Label>
          <div className="flex gap-2">
            <Input
              id="product-search"
              type="search"
              name="q"
              defaultValue={query.q}
              placeholder={t("products.searchPlaceholder")}
              className="h-11"
            />
            <Button type="submit" variant="outline" size="icon" aria-label={t("products.search")}>
              <SearchIcon aria-hidden className="size-4" />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:flex">
          <FilterSelect
            name="stock"
            label={t("products.stockFilter")}
            value={query.stock}
            options={productStockFilters.map((value) => ({
              value,
              label: t(`products.stock_${value}`),
            }))}
          />
          <FilterSelect
            name="category"
            label={t("products.categoryFilter")}
            value={query.category}
            options={[
              { value: "", label: t("products.allCollections") },
              ...categories.map((c) => ({ value: c.id, label: c.child ? `— ${c.name}` : c.name })),
            ]}
          />
          <FilterSelect
            name="sort"
            label={t("products.sortLabel")}
            value={query.sort}
            options={productSorts.map((value) => ({ value, label: t(`products.sort_${value}`) }))}
          />
        </div>
      </Form>

      <nav aria-label={t("products.statusFilter")} className="mb-4">
        <ScrollShadow scrollerClassName="flex gap-2 pb-1">
          {statuses.map((status) => (
            <Link
              key={status}
              to={withStatus(status)}
              aria-current={status === query.status ? "page" : undefined}
              className={cn(
                buttonVariants({ variant: status === query.status ? "default" : "outline" }),
                "shrink-0 rounded-full",
              )}
            >
              {t(`products.status_${status}`)}
              <span className="tabular-nums opacity-80">{counts[status]}</span>
            </Link>
          ))}
        </ScrollShadow>
      </nav>

      {products.length === 0 ? (
        <div
          role="status"
          className="grid justify-items-center gap-3 rounded-md border p-8 text-center"
        >
          <p className="text-muted-foreground">
            {filtered || query.status !== "all" ? t("products.noMatches") : t("products.empty")}
          </p>
          {filtered ? (
            <Link to={pathname} className={buttonVariants({ variant: "outline" })}>
              {t("products.clearFilters")}
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mb-2 flex min-h-11 items-center justify-between gap-2">
            <label className="flex min-h-11 items-center gap-3 px-1 text-sm">
              <input
                type="checkbox"
                className="size-5 accent-primary"
                checked={allOnPage}
                onChange={(event) =>
                  event.target.checked
                    ? setSelected([...new Set([...selected, ...products.map((p) => p.id)])])
                    : setSelected(selected.filter((id) => !products.some((p) => p.id === id)))
                }
              />
              {t("products.selectPage")}
            </label>
            <p className="text-sm text-muted-foreground">{t("products.count", { count: total })}</p>
          </div>
          <ul className="grid divide-y rounded-md border">
            {products.map((product) => {
              const checkboxId = `select-${product.id}`;
              return (
                <li key={product.id} className="flex items-center gap-2 pr-2 hover:bg-accent/50">
                  <label
                    htmlFor={checkboxId}
                    className="grid size-11 shrink-0 place-items-center pl-2"
                  >
                    <input
                      id={checkboxId}
                      type="checkbox"
                      className="size-5 accent-primary"
                      checked={selected.includes(product.id)}
                      onChange={(event) => toggle(product.id, event.target.checked)}
                      aria-label={t("products.select", { name: product.name })}
                    />
                  </label>
                  <Link
                    to={editor(product.id)}
                    className="grid min-h-16 flex-1 grid-cols-[3.5rem_1fr_auto] items-center gap-3 py-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <span className="relative size-14 overflow-hidden rounded-md bg-muted">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt=""
                          width={56}
                          height={56}
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      ) : (
                        <ImageIcon
                          aria-hidden
                          className="absolute inset-0 m-auto size-5 text-muted-foreground"
                        />
                      )}
                    </span>
                    <span className="grid min-w-0 gap-0.5">
                      <span className="truncate font-medium">{product.name}</span>
                      <span className="truncate text-sm text-muted-foreground">
                        {[
                          product.sku,
                          product.variants > 0
                            ? t("products.variantsCount", { count: product.variants })
                            : null,
                          product.digital ? t("products.digital") : null,
                          product.categories.join(", ") || null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      <StockLine inStock={product.inStock} stock={product.stock} />
                    </span>
                    <span className="grid justify-items-end gap-1 text-right">
                      {product.price !== null ? (
                        <span className="text-sm font-medium">
                          {product.variants > 0 ? `${t("products.from")} ` : ""}
                          {formatPrice(product.price, currency, locale)}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {t("products.noPrice")}
                        </span>
                      )}
                      {product.onSale ? (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                          {t("products.onOffer")}
                        </span>
                      ) : null}
                      <ProductStatusBadge status={product.status} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <AdminPagination page={page} pages={pages} />
        </>
      )}

      {selected.length > 0 ? (
        <BulkBar ids={selected} categories={categories} onClear={clear} />
      ) : null}
    </>
  );
}

function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: keyof ProductListQuery;
  label: string;
  value: string;
  options: { value: string; label: string }[];
}) {
  const id = `filter-${name}`;
  return (
    <div className="grid min-w-0 gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <select
        id={id}
        name={name}
        defaultValue={value}
        className="h-11 w-full min-w-0 rounded-md border bg-background px-2 text-sm"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function StockLine({ inStock, stock }: { inStock: boolean; stock: number | null }) {
  const t = useT();
  if (!inStock)
    return <span className="text-sm font-medium text-destructive">{t("products.soldOut")}</span>;
  if (stock === null)
    return <span className="text-sm text-muted-foreground">{t("products.available")}</span>;
  return (
    <span
      className={cn(
        "text-sm",
        stock <= 5 ? "font-medium text-destructive" : "text-muted-foreground",
      )}
    >
      {t("products.inStockCount", { count: stock })}
    </span>
  );
}

const BULK = "bulk-products";

const bulkActions = ["publish", "draft", "archive", "offer", "addCategory", "delete"] as const;

/**
 * What to do with the products selected. On the phone it sits above the bottom bar, in reach of
 * the thumb; it asks before deleting.
 */
function BulkBar({
  ids,
  categories,
  onClear,
}: {
  ids: string[];
  categories: { id: string; name: string; child: boolean }[];
  onClear: () => void;
}) {
  const t = useT();
  const fetcher = useFetcher<typeof action>({ key: BULK });
  const [actionName, setActionName] = useState<(typeof bulkActions)[number]>("publish");
  const busy = fetcher.state !== "idle";
  return (
    <fetcher.Form
      method="post"
      aria-label={t("products.bulkLabel")}
      className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 -mx-4 mt-4 grid gap-2 border-t bg-background px-4 py-3 shadow-[0_-4px_16px_rgb(0_0_0/0.08)] md:bottom-0 md:mx-0 md:rounded-md md:border"
      onSubmit={(event) => {
        if (
          actionName === "delete" &&
          !window.confirm(t("products.deleteConfirm", { count: ids.length }))
        ) {
          event.preventDefault();
          return;
        }
      }}
    >
      {ids.map((id) => (
        <input key={id} type="hidden" name="ids" value={id} />
      ))}
      <div className="flex items-center justify-between gap-2">
        <p role="status" className="text-sm font-medium">
          {t("products.selectedCount", { count: ids.length })}
        </p>
        <Button type="button" variant="ghost" onClick={onClear}>
          {t("products.clearSelection")}
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <Label htmlFor="bulk-action" className="sr-only">
          {t("products.bulkAction")}
        </Label>
        <select
          id="bulk-action"
          name="action"
          value={actionName}
          onChange={(event) => setActionName(event.target.value as (typeof bulkActions)[number])}
          className="h-11 rounded-md border bg-background px-3"
        >
          {bulkActions.map((value) => (
            <option key={value} value={value}>
              {t(`products.bulk_${value}`)}
            </option>
          ))}
        </select>
        {actionName === "offer" ? (
          <div className="flex items-center gap-2">
            <Label htmlFor="bulk-percent" className="whitespace-nowrap text-sm">
              {t("products.bulkPercent")}
            </Label>
            <Input
              id="bulk-percent"
              name="percent"
              type="number"
              inputMode="numeric"
              min={0}
              max={90}
              defaultValue={20}
              className="h-11 w-20"
            />
          </div>
        ) : actionName === "addCategory" ? (
          <>
            <Label htmlFor="bulk-category" className="sr-only">
              {t("products.bulkCategory")}
            </Label>
            <select
              id="bulk-category"
              name="categoryId"
              required
              className="h-11 rounded-md border bg-background px-3"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.child ? `— ${c.name}` : c.name}
                </option>
              ))}
            </select>
          </>
        ) : (
          <span className="hidden sm:block" />
        )}
        <Button
          type="submit"
          variant={actionName === "delete" ? "destructive" : "default"}
          disabled={busy || (actionName === "addCategory" && categories.length === 0)}
        >
          {busy ? t("products.applying") : t("products.apply")}
        </Button>
      </div>
      {actionName === "offer" ? (
        <p className="text-sm text-muted-foreground">{t("products.bulkOfferHint")}</p>
      ) : null}
    </fetcher.Form>
  );
}
