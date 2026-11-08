import { listOrders } from "@monaztore/core";
import type { OrderStatus } from "@monaztore/db/schema";
import { href, Link, useLocation } from "react-router";
import { OrderStatusBadge } from "~/components/orders/order-status";
import { PageHeader } from "~/components/page-header";
import { buttonVariants } from "~/components/ui/button";
import { ScrollShadow } from "~/components/ui/scroll-shadow";
import { tenantContext } from "~/context";
import { metaT, useLocale, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { formatPrice } from "~/lib/money";
import { pageParam } from "~/lib/storefront.server";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/orders";

const filters = ["all", "payment_submitted", "pending_payment", "paid", "cancelled"] as const;
type Filter = (typeof filters)[number];

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("orders.title") }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const asked = url.searchParams.get("status");
  const filter: Filter = filters.includes(asked as Filter) ? (asked as Filter) : "all";
  const result = await listOrders(context.get(tenantContext), {
    status: filter === "all" ? undefined : (filter as OrderStatus),
    page: pageParam(url),
  });
  return { ...result, filter, i18n: translations(context, "orders") };
}

export default function Orders({ loaderData, params }: Route.ComponentProps) {
  const t = useT();
  const locale = useLocale();
  const { orders, filter, page, pages } = loaderData;
  const list = href("/app/:workspace/orders", { workspace: params.workspace });
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <>
      <PageHeader title={t("orders.title")} description={t("orders.intro")} />
      <nav aria-label={t("orders.filterLabel")} className="mb-4">
        <ScrollShadow scrollerClassName="flex gap-2 pb-1">
          {filters.map((option) => (
            <Link
              key={option}
              to={option === "all" ? list : `${list}?status=${option}`}
              aria-current={option === filter ? "page" : undefined}
              className={cn(
                buttonVariants({ variant: option === filter ? "default" : "outline" }),
                "shrink-0 rounded-full",
              )}
            >
              {t(`orders.filter_${option}`)}
            </Link>
          ))}
        </ScrollShadow>
      </nav>
      {orders.length === 0 ? (
        <p role="status" className="rounded-md border p-6 text-center text-muted-foreground">
          {t("orders.empty")}
        </p>
      ) : (
        <ul className="grid divide-y rounded-md border">
          {orders.map((order) => (
            <li key={order.number}>
              <Link
                to={href("/app/:workspace/orders/:number", {
                  workspace: params.workspace,
                  number: String(order.number),
                })}
                className="grid min-h-11 grid-cols-[1fr_auto] gap-x-4 gap-y-1 p-4 hover:bg-accent"
              >
                <span className="font-medium">
                  {t("orders.number", { number: String(order.number) })} · {order.name}
                </span>
                <span className="text-right font-medium">
                  {formatPrice(order.total, order.currency, locale)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {date.format(new Date(order.createdAt))}
                </span>
                <span className="text-right">
                  <OrderStatusBadge status={order.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <OrdersPagination page={page} pages={pages} />
    </>
  );
}

function OrdersPagination({ page, pages }: { page: number; pages: number }) {
  const t = useT();
  const { pathname, search } = useLocation();
  if (pages <= 1) return null;
  const to = (target: number) => {
    const query = new URLSearchParams(search);
    if (target === 1) query.delete("page");
    else query.set("page", String(target));
    return query.size ? `${pathname}?${query}` : pathname;
  };
  return (
    <nav aria-label={t("orders.pagination")} className="mt-6 flex justify-between gap-2">
      {page > 1 ? (
        <Link to={to(page - 1)} rel="prev" className={buttonVariants({ variant: "outline" })}>
          {t("orders.previous")}
        </Link>
      ) : (
        <span />
      )}
      {page < pages ? (
        <Link to={to(page + 1)} rel="next" className={buttonVariants({ variant: "outline" })}>
          {t("orders.next")}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
