import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { bpsToPercent, defaultCommissionSchema, percentToBps } from "@monaztore/contracts";
import { getPlatformSettings, setDefaultCommission, setSupportNotice } from "@monaztore/core";
import { data, useFetcher } from "react-router";
import { PageHeader } from "~/components/page-header";
import { TextField } from "~/components/text-field";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { superAdminContext } from "~/context";
import { metaT, useT } from "~/lib/i18n";
import type { Route } from "./+types/commission";

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return [{ title: t("admin.titleSuffix", { title: t("admin.commissionTitle") }) }];
}

export async function loader({ context }: Route.LoaderArgs) {
  return { settings: await getPlatformSettings(context.get(superAdminContext)) };
}

/**
 * The platform's commission on card sales, and whether stores are told when support enters.
 * Both go to the internal log with the value before and after.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const admin = context.get(superAdminContext);
  const formData = await request.formData();
  if (formData.get("intent") === "support") {
    await setSupportNotice(admin, formData.get("notify") === "on");
    return { result: undefined, saved: null };
  }
  const submission = parseWithZod(formData, { schema: defaultCommissionSchema });
  if (submission.status !== "success") {
    return data({ result: submission.reply(), saved: null }, { status: 400 });
  }
  const bps = percentToBps(submission.value.percent) ?? 0;
  await setDefaultCommission(admin, bps);
  return { result: submission.reply(), saved: bpsToPercent(bps) };
}

export default function AdminCommission({ loaderData }: Route.ComponentProps) {
  const t = useT();
  const { settings } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const support = useFetcher();
  const [form, fields] = useForm({
    id: "default-commission",
    lastResult: fetcher.data?.result,
    defaultValue: { percent: bpsToPercent(settings.cardCommissionBps) },
    shouldValidate: "onBlur",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: defaultCommissionSchema }),
  });

  return (
    <>
      <PageHeader title={t("admin.commissionTitle")} description={t("admin.commissionIntro")} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("admin.commissionDefault")}</h2>
            </CardTitle>
            <CardDescription>{t("admin.commissionDefaultIntro")}</CardDescription>
          </CardHeader>
          <CardContent>
            <fetcher.Form method="post" className="grid gap-4" {...getFormProps(form)}>
              <TextField
                field={fields.percent}
                label={t("admin.commissionLabel")}
                inputMode="decimal"
                autoComplete="off"
              />
              {fetcher.state === "idle" && fetcher.data?.saved ? (
                <p role="status" className="text-sm">
                  {t("admin.commissionSaved", { percent: fetcher.data.saved })}
                </p>
              ) : null}
              <Button type="submit" disabled={fetcher.state !== "idle"}>
                {t("admin.commissionSave")}
              </Button>
            </fetcher.Form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("admin.supportHeading")}</h2>
            </CardTitle>
            <CardDescription>{t("admin.supportIntro")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <p role="status" className="text-sm font-medium">
              {settings.notifySupportAccess ? t("admin.supportOn") : t("admin.supportOff")}
            </p>
            <support.Form method="post">
              <input type="hidden" name="intent" value="support" />
              <input
                type="hidden"
                name="notify"
                value={settings.notifySupportAccess ? "off" : "on"}
              />
              <Button type="submit" variant="outline" disabled={support.state !== "idle"}>
                {settings.notifySupportAccess
                  ? t("admin.supportTurnOff")
                  : t("admin.supportTurnOn")}
              </Button>
            </support.Form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
