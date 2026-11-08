import { catalogSettings, listCoupons, setCouponActive } from "@monaztore/core";
import { PlusIcon } from "lucide-react";
import { data, href, Link, useFetcher, useSearchParams } from "react-router";
import { PageHeader } from "~/components/page-header";
import { CatalogTabs } from "~/components/products/catalog-tabs";
import { couponState, couponValue } from "~/components/products/coupon-info";
import { buttonVariants } from "~/components/ui/button";
import { tenantContext } from "~/context";
import { metaT, useLocale, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/coupons";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("coupons.title") }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const tenant = context.get(tenantContext);
  const [coupons, settings] = await Promise.all([listCoupons(tenant), catalogSettings(tenant)]);
  return {
    coupons,
    currency: settings.currency,
    owner: tenant.role === "owner",
    now: Date.now(),
    i18n: translations(context, "coupons", "products"),
  };
}

/** Turns a coupon on or off from the list. */
export async function action({ request, context }: Route.ActionArgs) {
  const tenant = context.get(tenantContext);
  if (tenant.role !== "owner") throw data("Only owners manage coupons", { status: 403 });
  const formData = await request.formData();
  await setCouponActive(
    tenant,
    String(formData.get("id") ?? ""),
    formData.get("active") === "true",
  );
  return { ok: true };
}

export default function Coupons({ loaderData, params }: Route.ComponentProps) {
  const t = useT();
  const locale = useLocale();
  const { coupons, currency, owner, now } = loaderData;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const [search] = useSearchParams();
  const saved = search.get("saved");
  const editor = (couponId: string) =>
    href("/app/:workspace/coupons/:couponId", { workspace: params.workspace, couponId });

  return (
    <>
      <PageHeader title={t("coupons.title")} description={t("coupons.intro")}>
        {owner ? (
          <Link to={editor("new")} className={buttonVariants({ className: "w-full sm:w-auto" })}>
            <PlusIcon aria-hidden className="size-4" />
            {t("coupons.newCoupon")}
          </Link>
        ) : null}
      </PageHeader>
      <CatalogTabs workspace={params.workspace} />
      {saved ? (
        <p role="status" className="mb-4 rounded-md border border-primary p-3 text-sm">
          {t("coupons.saved", { code: saved })}
        </p>
      ) : null}
      {owner ? null : (
        <p role="status" className="mb-4 rounded-md border p-3 text-sm">
          {t("coupons.ownersOnly")}
        </p>
      )}
      {coupons.length === 0 ? (
        <p role="status" className="rounded-md border p-6 text-center text-muted-foreground">
          {t("coupons.empty")}
        </p>
      ) : (
        <ul className="grid divide-y rounded-md border">
          {coupons.map((coupon) => {
            const state = couponState(coupon, now);
            return (
              <li key={coupon.id} className="flex items-center gap-2 p-3">
                <Link
                  to={editor(coupon.id)}
                  className="grid min-h-11 flex-1 gap-0.5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold">{coupon.code}</span>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-xs font-medium",
                        state === "active"
                          ? "border-primary bg-primary text-primary-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {t(`coupons.state_${state}`)}
                    </span>
                  </span>
                  <span className="text-sm">{couponValue(t, coupon, currency, locale)}</span>
                  <span className="text-sm text-muted-foreground">
                    {[
                      coupon.usageLimit !== null
                        ? t("coupons.usesOf", { used: coupon.usedCount, limit: coupon.usageLimit })
                        : t("coupons.uses", { count: coupon.usedCount }),
                      coupon.endsAt
                        ? t("coupons.until", {
                            date: date.format(new Date(new Date(coupon.endsAt).getTime() - 1)),
                          })
                        : null,
                      coupon.note || null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </Link>
                {owner ? (
                  <ActiveToggle id={coupon.id} code={coupon.code} active={coupon.active} />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function ActiveToggle({ id, code, active }: { id: string; code: string; active: boolean }) {
  const t = useT();
  const fetcher = useFetcher();
  const on = fetcher.formData ? fetcher.formData.get("active") === "true" : active;
  return (
    <fetcher.Form method="post">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={String(!on)} />
      <button
        type="submit"
        role="switch"
        aria-checked={on}
        aria-label={t("coupons.toggle", { code })}
        className="grid min-h-11 min-w-11 place-items-center outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span
          className={cn(
            "flex h-6 w-11 items-center rounded-full p-0.5 transition-colors",
            on ? "bg-primary" : "bg-muted-foreground/40",
          )}
        >
          <span
            className={cn(
              "size-5 rounded-full bg-background shadow transition-transform",
              on && "translate-x-5",
            )}
          />
        </span>
      </button>
    </fetcher.Form>
  );
}
