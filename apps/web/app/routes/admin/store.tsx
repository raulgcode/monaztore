import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { bpsToPercent, percentToBps, storeCommissionSchema } from "@monaztore/contracts";
import { getStore, listAuditLog, NotFoundError, setStoreCommission } from "@monaztore/core";
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import { data, href, Link, useFetcher } from "react-router";
import { AuditList } from "~/components/admin/audit-list";
import { PageHeader } from "~/components/page-header";
import { TextField } from "~/components/text-field";
import { Button, buttonVariants } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { superAdminContext } from "~/context";
import { metaT, useLocale, useT } from "~/lib/i18n";
import { formatPrice } from "~/lib/money";
import type { Route } from "./+types/store";

export function meta({ matches, loaderData }: Route.MetaArgs) {
  const t = metaT(matches);
  return [
    { title: t("admin.titleSuffix", { title: loaderData?.store.name ?? t("admin.storesTitle") }) },
  ];
}

async function storeOr404(promise: ReturnType<typeof getStore>) {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof NotFoundError) throw data("Store not found", { status: 404 });
    throw error;
  }
}

/** One store as support sees it: team and second step, domains, numbers and commission. */
export async function loader({ params, context }: Route.LoaderArgs) {
  const admin = context.get(superAdminContext);
  const store = await storeOr404(getStore(admin, params.storeId));
  const log = await listAuditLog(admin, { organizationId: store.id });
  return { store, log: log.rows };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const admin = context.get(superAdminContext);
  const submission = parseWithZod(await request.formData(), { schema: storeCommissionSchema });
  if (submission.status !== "success") {
    return data({ result: submission.reply(), saved: false }, { status: 400 });
  }
  const { percent, note } = submission.value;
  try {
    await setStoreCommission(admin, params.storeId, {
      bps: percent ? percentToBps(percent) : null,
      note,
    });
  } catch (error) {
    if (error instanceof NotFoundError) throw data("Store not found", { status: 404 });
    throw error;
  }
  return { result: submission.reply(), saved: true };
}

export default function AdminStore({ loaderData }: Route.ComponentProps) {
  const t = useT();
  const locale = useLocale();
  const { store, log } = loaderData;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "long" });
  const primary = store.domains.find((domain) => domain.primary) ?? store.domains[0];

  return (
    <>
      <Link
        to={href("/admin")}
        className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon aria-hidden className="size-4" />
        {t("admin.storeBack")}
      </Link>
      <PageHeader
        title={store.name}
        description={t("admin.storeOpened", { date: date.format(new Date(store.createdAt)) })}
      >
        {primary ? (
          <a
            href={`https://${primary.hostname}`}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "outline" })}
          >
            <ExternalLinkIcon aria-hidden className="size-4" />
            {t("admin.storeVisit")}
          </a>
        ) : null}
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("admin.storeNumbers")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <Stat
                label={t("admin.storeProductsOnSale")}
                value={String(store.products.active)}
                hint={t("admin.storeProductsTotal", { total: store.products.total })}
              />
              <Stat
                label={t("admin.storeOrdersPaid")}
                value={String(store.orders.paid)}
                hint={t("admin.storeOrdersTotal", { total: store.orders.total })}
              />
              <Stat
                label={t("admin.storeOrdersPending")}
                value={String(store.orders.pendingPayment)}
              />
              <Stat
                label={t("admin.storePaidTotal")}
                value={formatPrice(store.paidTotal, store.currency, locale)}
              />
            </dl>
          </CardContent>
        </Card>
        <CommissionCard commission={store.commission} />
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("admin.storeTeam")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-4">
              {store.members.map((member) => (
                <li key={member.userId} className="grid gap-0.5 text-sm">
                  <p className="truncate text-base font-medium">{member.name || member.email}</p>
                  {member.name ? (
                    <p className="truncate text-muted-foreground">{member.email}</p>
                  ) : null}
                  <p className="text-muted-foreground">
                    {member.role === "owner"
                      ? t("admin.storeRoleOwner")
                      : t("admin.storeRoleMember")}{" "}
                    · {member.hasMfa ? t("admin.storeMfaOn") : t("admin.storeMfaOff")}
                    {member.passkeys > 0
                      ? ` · ${t("admin.storePasskeys", { count: member.passkeys })}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("admin.storeDomains")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {store.domains.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("admin.storeNoDomains")}</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {store.domains.map((domain) => (
                  <li key={domain.hostname} className="flex flex-wrap items-center gap-2">
                    <span className="break-all font-medium">{domain.hostname}</span>
                    {domain.primary ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {t("admin.storePrimary")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <section aria-labelledby="store-log" className="mt-8 grid gap-3">
        <h2 id="store-log" className="text-lg font-semibold">
          {t("admin.storeLog")}
        </h2>
        <AuditList rows={log} showStore={false} />
      </section>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
      {hint ? <dd className="text-sm text-muted-foreground">{hint}</dd> : null}
    </div>
  );
}

function CommissionCard({
  commission,
}: {
  commission: { defaultBps: number; ownBps: number | null; note: string | null };
}) {
  const t = useT();
  const fetcher = useFetcher<typeof action>();
  const [form, fields] = useForm({
    id: "store-commission",
    lastResult: fetcher.data?.result,
    defaultValue: {
      percent: commission.ownBps === null ? "" : bpsToPercent(commission.ownBps),
      note: commission.note ?? "",
    },
    shouldValidate: "onBlur",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: storeCommissionSchema }),
  });
  const platform = bpsToPercent(commission.defaultBps);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("admin.storeCommission")}</h2>
        </CardTitle>
        <CardDescription>{t("admin.storeCommissionIntro", { percent: platform })}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm font-medium">
          {commission.ownBps === null
            ? t("admin.storeCommissionFollowing", { percent: platform })
            : t("admin.storeCommissionOwn", { percent: bpsToPercent(commission.ownBps) })}
        </p>
        <fetcher.Form method="post" className="grid gap-4" {...getFormProps(form)}>
          <TextField
            field={fields.percent}
            label={t("admin.storeCommissionLabel")}
            inputMode="decimal"
            autoComplete="off"
            placeholder={platform}
          />
          <TextField
            field={fields.note}
            label={t("admin.storeCommissionNote")}
            autoComplete="off"
          />
          {fetcher.state === "idle" && fetcher.data?.saved ? (
            <p role="status" className="text-sm">
              {t("admin.storeCommissionSaved")}
            </p>
          ) : null}
          <Button type="submit" disabled={fetcher.state !== "idle"}>
            {t("admin.storeCommissionSave")}
          </Button>
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}
