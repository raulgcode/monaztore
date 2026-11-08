import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { domainSchema, paymentSettingsSchema, paymentsFromForm } from "@monaztore/contracts";
import {
  addStoreDomain,
  DomainError,
  getEinvoicing,
  getStorePayments,
  listStoreDomains,
  removeStoreDomain,
  setPrimaryDomain,
  updateStorePayments,
} from "@monaztore/core";
import { data, Form, href, Link, useNavigation } from "react-router";
import { PageHeader } from "~/components/page-header";
import { FieldErrors, TextField } from "~/components/text-field";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import { tenantContext } from "~/context";
import { metaT, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { storeOrigin } from "~/lib/store-seo";
import type { Route } from "./+types/store";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("store.title") }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = context.get(tenantContext);
  const [domains, payments, einvoicing] = await Promise.all([
    listStoreDomains(tenant),
    getStorePayments(tenant),
    getEinvoicing(tenant),
  ]);
  const primary = domains.find((domain) => domain.primary) ?? domains[0];
  return {
    domains,
    payments,
    storeUrl: primary ? storeOrigin(primary.hostname, request.url) : null,
    owner: tenant.role === "owner",
    // Electronic invoicing is for stores in Costa Rica only.
    einvoicing: einvoicing.available ? { enabled: einvoicing.enabled } : null,
    i18n: einvoicing.available
      ? translations(context, "store", "forms", "einvoicing", "digital")
      : translations(context, "store", "forms", "digital"),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = context.get(tenantContext);
  if (tenant.role !== "owner") throw data("Only owners change the store", { status: 403 });
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "payments") {
    const submission = parseWithZod(formData, { schema: paymentSettingsSchema });
    if (submission.status !== "success") {
      return data({ intent, result: submission.reply(), done: null }, { status: 400 });
    }
    await updateStorePayments(tenant, paymentsFromForm(submission.value));
    return { intent, result: submission.reply(), done: "paymentsSaved" as const };
  }

  if (intent === "add-domain") {
    const submission = parseWithZod(formData, { schema: domainSchema });
    if (submission.status !== "success") {
      return data({ intent, result: submission.reply(), done: null }, { status: 400 });
    }
    try {
      await addStoreDomain(tenant, submission.value.hostname, {
        primary: (await listStoreDomains(tenant)).length === 0,
      });
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      const key = error.code === "hostname_taken" ? "store.domainTaken" : "forms.domainInvalid";
      return data(
        { intent, result: submission.reply({ fieldErrors: { hostname: [key] } }), done: null },
        { status: 400 },
      );
    }
    return { intent, result: submission.reply({ resetForm: true }), done: "domainAdded" as const };
  }

  const hostname = String(formData.get("hostname") ?? "");
  if (intent === "make-primary") {
    try {
      await setPrimaryDomain(tenant, hostname);
    } catch (error) {
      if (error instanceof DomainError && error.code === "not_found") {
        throw data("No such domain", { status: 404 });
      }
      throw error;
    }
    return { intent, result: undefined, done: null };
  }
  if (intent === "remove-domain") {
    await removeStoreDomain(tenant, hostname);
    return { intent, result: undefined, done: null };
  }
  throw data("Unknown intent", { status: 400 });
}

export default function Store({ loaderData, actionData, params }: Route.ComponentProps) {
  const t = useT();
  const { owner } = loaderData;
  return (
    <>
      <PageHeader title={t("store.title")} description={t("store.intro")}>
        {loaderData.storeUrl ? (
          <a
            href={loaderData.storeUrl}
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            {t("store.openStore")}
          </a>
        ) : null}
      </PageHeader>
      {owner ? null : (
        <p role="status" className="mb-4 rounded-md border p-3 text-sm">
          {t("store.ownersOnly")}
        </p>
      )}
      <div className="grid gap-6">
        <Link
          to={href("/app/:workspace/downloads", { workspace: params.workspace })}
          className="grid min-h-14 gap-1 rounded-xl border bg-card p-4 text-card-foreground hover:bg-muted"
        >
          <span className="font-medium">{t("digital.openCard")}</span>
          <span className="text-sm text-muted-foreground">{t("digital.openCardHint")}</span>
        </Link>
        {loaderData.einvoicing ? (
          <Link
            to={href("/app/:workspace/invoicing", { workspace: params.workspace })}
            className="grid min-h-14 gap-1 rounded-xl border bg-card p-4 text-card-foreground hover:bg-muted"
          >
            <span className="font-medium">{t("einvoicing.open")} →</span>
            <span className="text-sm text-muted-foreground">
              {loaderData.einvoicing.enabled ? t("einvoicing.statusOn") : t("einvoicing.openHint")}
            </span>
          </Link>
        ) : null}
        <Domains
          domains={loaderData.domains}
          owner={owner}
          actionData={actionData?.intent === "add-domain" ? actionData : undefined}
        />
        <Payments
          payments={loaderData.payments}
          owner={owner}
          actionData={actionData?.intent === "payments" ? actionData : undefined}
        />
      </div>
    </>
  );
}

type ActionData = Route.ComponentProps["actionData"];

function Domains({
  domains,
  owner,
  actionData,
}: {
  domains: Route.ComponentProps["loaderData"]["domains"];
  owner: boolean;
  actionData: ActionData;
}) {
  const t = useT();
  const navigation = useNavigation();
  const [form, fields] = useForm({
    id: "add-domain",
    lastResult: actionData?.result,
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: domainSchema }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("store.domainsHeading")}</h2>
        </CardTitle>
        <CardDescription>{t("store.domainsIntro")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {domains.length === 0 ? (
          <p className="text-sm">{t("store.noDomains")}</p>
        ) : (
          <ul className="grid divide-y rounded-md border">
            {domains.map((domain) => (
              <li
                key={domain.hostname}
                className="flex flex-wrap items-center justify-between gap-2 p-3"
              >
                <span className="flex items-center gap-2 break-all">
                  {domain.hostname}
                  {domain.primary ? (
                    <span className="rounded-full border px-2 py-0.5 text-xs">
                      {t("store.primary")}
                    </span>
                  ) : null}
                </span>
                {owner ? (
                  <Form method="post" className="flex gap-2">
                    <input type="hidden" name="hostname" value={domain.hostname} />
                    {domain.primary ? null : (
                      <Button type="submit" name="intent" value="make-primary" variant="outline">
                        {t("store.makePrimary")}
                      </Button>
                    )}
                    <Button
                      type="submit"
                      name="intent"
                      value="remove-domain"
                      variant="ghost"
                      aria-label={t("store.removeDomain", { hostname: domain.hostname })}
                    >
                      ×
                    </Button>
                  </Form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {owner ? (
          <Form
            method="post"
            className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
            {...getFormProps(form)}
          >
            <input type="hidden" name="intent" value="add-domain" />
            <TextField
              field={fields.hostname}
              label={t("store.domainLabel")}
              placeholder="mitienda.com"
              autoCapitalize="none"
              spellCheck={false}
            />
            <Button type="submit" variant="outline" disabled={navigation.state === "submitting"}>
              {t("store.addDomain")}
            </Button>
          </Form>
        ) : null}
        {actionData?.done === "domainAdded" ? (
          <p role="status" className="text-sm">
            {t("store.domainAdded")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Payments({
  payments,
  owner,
  actionData,
}: {
  payments: Route.ComponentProps["loaderData"]["payments"];
  owner: boolean;
  actionData: ActionData;
}) {
  const t = useT();
  const navigation = useNavigation();
  const [form, fields] = useForm({
    id: "payments",
    lastResult: actionData?.result,
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: paymentSettingsSchema }),
    defaultValue: {
      sinpeEnabled: payments.sinpe?.enabled ? "on" : undefined,
      sinpePhone: payments.sinpe?.phone ?? "",
      sinpeHolder: payments.sinpe?.holder ?? "",
      transferEnabled: payments.transfer?.enabled ? "on" : undefined,
      transferBank: payments.transfer?.bank ?? "",
      transferIban: payments.transfer?.iban ?? "",
      transferHolder: payments.transfer?.holder ?? "",
    },
  });
  const checkbox = (field: typeof fields.sinpeEnabled, label: string) => (
    <div className="flex min-h-11 items-center gap-3">
      <input
        {...getInputProps(field, { type: "checkbox" })}
        className="size-5 accent-primary"
        disabled={!owner}
      />
      <Label htmlFor={field.id} className="font-medium">
        {label}
      </Label>
    </div>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("store.paymentsHeading")}</h2>
        </CardTitle>
        <CardDescription>{t("store.paymentsIntro")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form method="post" className="grid gap-6" {...getFormProps(form)}>
          <input type="hidden" name="intent" value="payments" />
          <fieldset className="grid gap-3" disabled={!owner}>
            <legend className="sr-only">{t("store.sinpeLabel")}</legend>
            {checkbox(fields.sinpeEnabled, t("store.sinpeLabel"))}
            <TextField
              field={fields.sinpePhone}
              type="tel"
              label={t("store.sinpePhone")}
              placeholder="8888-1234"
            />
            <TextField field={fields.sinpeHolder} label={t("store.holder")} />
          </fieldset>
          <fieldset className="grid gap-3" disabled={!owner}>
            <legend className="sr-only">{t("store.transferLabel")}</legend>
            {checkbox(fields.transferEnabled, t("store.transferLabel"))}
            <TextField field={fields.transferBank} label={t("store.bank")} />
            <TextField
              field={fields.transferIban}
              label={t("store.iban")}
              placeholder="CR05015202001026284066"
              autoCapitalize="characters"
              spellCheck={false}
            />
            <TextField field={fields.transferHolder} label={t("store.holder")} />
          </fieldset>
          <FieldErrors id={form.errorId} errors={form.errors} />
          {owner ? (
            <Button type="submit" disabled={navigation.state === "submitting"}>
              {t("store.savePayments")}
            </Button>
          ) : null}
          {actionData?.done === "paymentsSaved" ? (
            <p role="status" className="text-sm">
              {t("store.paymentsSaved")}
            </p>
          ) : null}
        </Form>
      </CardContent>
    </Card>
  );
}
