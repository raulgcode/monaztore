import { readAdminStoreQuery } from "@monaztore/contracts";
import { listStores } from "@monaztore/core";
import { SearchIcon } from "lucide-react";
import { Form, href, Link } from "react-router";
import { AdminPagination } from "~/components/admin/pagination";
import { PageHeader } from "~/components/page-header";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { superAdminContext } from "~/context";
import { metaT, useLocale, useT } from "~/lib/i18n";
import type { Route } from "./+types/stores";

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return [{ title: t("admin.titleSuffix", { title: t("admin.storesTitle") }) }];
}

/** Every store on the platform, searched and paged in Postgres (`?q=&page=`). */
export async function loader({ request, context }: Route.LoaderArgs) {
  const query = readAdminStoreQuery(new URL(request.url).searchParams);
  return { ...(await listStores(context.get(superAdminContext), query)), q: query.q };
}

export default function AdminStores({ loaderData }: Route.ComponentProps) {
  const t = useT();
  const locale = useLocale();
  const { rows, total, page, pages, q } = loaderData;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <>
      <PageHeader title={t("admin.storesTitle")} description={t("admin.storesIntro")} />
      <Form method="get" role="search" className="mb-4 grid gap-2">
        <Label htmlFor="q">{t("admin.storesSearch")}</Label>
        <div className="flex gap-2">
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder={t("admin.storesSearchHint")}
            className="min-w-0 flex-1"
          />
          <Button type="submit" variant="outline">
            <SearchIcon aria-hidden className="size-4" />
            {t("admin.storesSearchButton")}
          </Button>
        </div>
      </Form>
      <p className="mb-2 text-sm text-muted-foreground" role="status">
        {t("admin.storesCount", { count: total })}
      </p>
      {rows.length === 0 ? (
        <p className="rounded-md border p-6 text-center text-muted-foreground">
          {t("admin.storesEmpty")}
        </p>
      ) : (
        <ul className="grid divide-y rounded-md border">
          {rows.map((store) => (
            <li key={store.id}>
              <Link
                to={href("/admin/stores/:storeId", { storeId: store.id })}
                className="grid min-h-11 gap-1 p-4 hover:bg-accent sm:grid-cols-[1fr_auto] sm:gap-x-4"
              >
                <span className="min-w-0 truncate font-medium">{store.name}</span>
                <span className="text-sm text-muted-foreground sm:text-right">
                  {date.format(new Date(store.createdAt))}
                </span>
                <span className="min-w-0 truncate text-sm text-muted-foreground">
                  {store.primaryDomain ?? store.slug} ·{" "}
                  {store.ownerEmail ?? t("admin.storesNoOwner")}
                </span>
                <span className="text-sm text-muted-foreground sm:text-right">
                  {t("admin.storesProducts", { count: store.products })} ·{" "}
                  {t("admin.storesOrders", { count: store.orders })}
                </span>
                {store.ownCommissionBps !== null ? (
                  <span className="text-sm font-medium">
                    {t("admin.storesOwnCommission", {
                      percent: String(store.ownCommissionBps / 100),
                    })}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <AdminPagination page={page} pages={pages} />
    </>
  );
}
