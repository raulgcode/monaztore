import { getFormProps, getInputProps, getSelectProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  cleanTaxId,
  einvoicingCredentialsSchema,
  einvoicingIssuerSchema,
  einvoicingOptionsSchema,
  einvoicingProductSchema,
  taxIdTypeOf,
} from "@monaztore/contracts";
import {
  DomainError,
  getEinvoicing,
  listEinvoices,
  saveEinvoicingCredentials,
  saveEinvoicingIssuer,
  saveEinvoicingOptions,
  saveEinvoicingProduct,
  setEinvoicingEnabled,
} from "@monaztore/core";
import { findTaxpayer, searchCabys } from "@monaztore/hacienda";
import { districts, provinces } from "@monaztore/hacienda/locations";
import { useState } from "react";
import { data, Form, href, Link, useNavigation } from "react-router";
import {
  EinvoiceDownloads,
  EinvoiceProblem,
  EinvoiceStatusBadge,
} from "~/components/einvoicing/einvoice-status";
import { PageHeader } from "~/components/page-header";
import { FieldErrors, TextField } from "~/components/text-field";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import { tenantContext } from "~/context";
import { einvoicingCredentialDeps } from "~/lib/einvoicing.server";
import { metaT, useLocale, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { formatPrice } from "~/lib/money";
import { withinRateLimits } from "~/lib/rate-limit.server";
import type { Route } from "./+types/invoicing";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("einvoicing.title") }];
}

/** How many of the latest documents the page lists; each order shows its own. */
const RECENT_DOCUMENTS = 10;

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = context.get(tenantContext);
  const settings = await getEinvoicing(tenant);
  // Only stores in Costa Rica: anywhere else the page doesn't exist.
  if (!settings.available) throw data("Not found", { status: 404 });
  const owner = tenant.role === "owner";
  const url = new URL(request.url);
  const cedula = cleanTaxId(url.searchParams.get("cedula") ?? "");
  const cabysQuery = (url.searchParams.get("cabys") ?? "").trim().slice(0, 80);
  const lookups = owner && (cedula || cabysQuery);
  const allowed = lookups
    ? await withinRateLimits([["haciendaLookup", tenant.organizationId]])
    : false;
  const [taxpayer, cabys, recent] = await Promise.all([
    allowed && taxIdTypeOf(cedula) ? findTaxpayer(cedula) : undefined,
    allowed && cabysQuery ? searchCabys(cabysQuery) : undefined,
    listEinvoices(tenant),
  ]);
  return {
    settings,
    owner,
    lookup: cedula ? { cedula, taxpayer: taxpayer ?? null } : null,
    cabys: cabysQuery ? { query: cabysQuery, results: cabys ?? [] } : null,
    provinces: provinces(),
    districts: districts(),
    recent: recent.einvoices.slice(0, RECENT_DOCUMENTS),
    i18n: translations(context, "einvoicing", "forms", "orders"),
  };
}

const credentialErrors: Record<string, [string, string]> = {
  password_required: ["haciendaPassword", "forms.haciendaPasswordRequired"],
  certificate_required: ["certificate", "forms.certificateRequired"],
  pin_required: ["certificatePin", "forms.pinRequired"],
  certificate_unreadable: ["certificatePin", "forms.certificateUnreadable"],
  certificate_expired: ["certificate", "forms.certificateExpired"],
  credentials_wrong: ["haciendaPassword", "forms.haciendaCredentialsWrong"],
};

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = context.get(tenantContext);
  if (tenant.role !== "owner") throw data("Only owners change invoicing", { status: 403 });
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "issuer") {
    const submission = parseWithZod(formData, { schema: einvoicingIssuerSchema });
    if (submission.status !== "success") {
      return data({ intent, result: submission.reply(), done: null }, { status: 400 });
    }
    try {
      await saveEinvoicingIssuer(tenant, submission.value);
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      const fieldErrors: Record<string, string[]> =
        error.code === "district_invalid"
          ? { district: ["forms.districtRequired"] }
          : { idNumber: ["forms.taxIdInvalid"] };
      return data(
        { intent, result: submission.reply({ fieldErrors }), done: null },
        { status: 400 },
      );
    }
    return { intent, result: submission.reply(), done: "issuerSaved" as const };
  }

  if (intent === "product") {
    const submission = parseWithZod(formData, { schema: einvoicingProductSchema });
    if (submission.status !== "success") {
      return data({ intent, result: submission.reply(), done: null }, { status: 400 });
    }
    await saveEinvoicingProduct(tenant, submission.value);
    return { intent, result: submission.reply(), done: "productSaved" as const };
  }

  if (intent === "credentials") {
    const submission = parseWithZod(formData, { schema: einvoicingCredentialsSchema });
    if (submission.status !== "success") {
      return data({ intent, result: submission.reply(), done: null }, { status: 400 });
    }
    if (!(await withinRateLimits([["haciendaLogin", tenant.organizationId]]))) {
      return data(
        { intent, result: submission.reply({ formErrors: ["forms.tooManyAttempts"] }), done: null },
        { status: 429 },
      );
    }
    const { certificate, ...rest } = submission.value;
    try {
      await saveEinvoicingCredentials(
        tenant,
        {
          ...rest,
          certificate: certificate?.size ? Buffer.from(await certificate.arrayBuffer()) : undefined,
        },
        einvoicingCredentialDeps,
      );
    } catch (error) {
      const known = error instanceof DomainError ? credentialErrors[error.code] : undefined;
      if (!known) throw error;
      const [field, key] = known;
      return data(
        {
          intent,
          result: submission.reply({
            fieldErrors: { [field]: [key] },
            hideFields: ["haciendaPassword"],
          }),
          done: null,
        },
        { status: 400 },
      );
    }
    return {
      intent,
      result: submission.reply({ resetForm: true }),
      done: "credentialsSaved" as const,
    };
  }

  if (intent === "options") {
    const submission = parseWithZod(formData, { schema: einvoicingOptionsSchema });
    if (submission.status !== "success") {
      return data({ intent, result: submission.reply(), done: null }, { status: 400 });
    }
    await saveEinvoicingOptions(tenant, submission.value);
    return { intent, result: submission.reply(), done: "optionsSaved" as const };
  }

  if (intent === "enable" || intent === "disable") {
    try {
      await setEinvoicingEnabled(tenant, intent === "enable");
    } catch (error) {
      if (error instanceof DomainError && error.code === "einvoicing_incomplete") {
        return data({ intent, result: undefined, done: "incomplete" as const }, { status: 400 });
      }
      throw error;
    }
    return {
      intent,
      result: undefined,
      done: intent === "enable" ? ("enabled" as const) : ("disabled" as const),
    };
  }
  throw data("Unknown intent", { status: 400 });
}

type LoaderData = Route.ComponentProps["loaderData"];
type ActionData = Route.ComponentProps["actionData"];

export default function Invoicing({ loaderData, actionData, params }: Route.ComponentProps) {
  const t = useT();
  const navigation = useNavigation();
  const { settings, owner } = loaderData;
  const { steps } = settings;
  const left = [steps.issuer, steps.product, steps.credentials].filter((done) => !done).length;
  const sandbox = settings.credentials.environment === "sandbox";
  const firstOpen = !steps.issuer
    ? "issuer"
    : !steps.product
      ? "product"
      : !steps.credentials
        ? "credentials"
        : null;
  const forIntent = (intent: string) => (actionData?.intent === intent ? actionData : undefined);
  const notice =
    actionData?.done === "enabled" ||
    actionData?.done === "disabled" ||
    actionData?.done === "incomplete"
      ? actionData.done
      : null;

  return (
    <>
      <Link
        to={href("/app/:workspace/store", { workspace: params.workspace })}
        className="mb-4 inline-flex min-h-11 items-center text-sm underline underline-offset-4"
      >
        ← {t("workspace.navStore")}
      </Link>
      <PageHeader title={t("einvoicing.title")} description={t("einvoicing.intro")} />
      {owner ? null : (
        <p role="status" className="mb-4 rounded-md border p-3 text-sm">
          {t("einvoicing.ownersOnly")}
        </p>
      )}
      <p
        role="status"
        className="mb-6 rounded-md border p-3 text-sm font-medium"
        data-testid="einvoicing-status"
      >
        {settings.enabled
          ? sandbox
            ? t("einvoicing.statusOnSandbox")
            : t("einvoicing.statusOn")
          : left > 0
            ? `${t("einvoicing.statusOff")} ${t("einvoicing.stepsLeft", { count: String(left) })}`
            : t("einvoicing.statusOff")}
      </p>
      <div className="grid gap-4">
        <Step
          id="issuer"
          title={t("einvoicing.issuerStep")}
          done={steps.issuer}
          open={firstOpen === "issuer" || actionData?.intent === "issuer"}
        >
          <IssuerStep loaderData={loaderData} actionData={forIntent("issuer")} />
        </Step>
        <Step
          id="product"
          title={t("einvoicing.productStep")}
          done={steps.product}
          open={
            firstOpen === "product" || actionData?.intent === "product" || loaderData.cabys !== null
          }
        >
          <ProductStep loaderData={loaderData} actionData={forIntent("product")} />
        </Step>
        <Step
          id="credentials"
          title={t("einvoicing.credentialsStep")}
          done={steps.credentials}
          open={firstOpen === "credentials" || actionData?.intent === "credentials"}
        >
          <CredentialsStep loaderData={loaderData} actionData={forIntent("credentials")} />
        </Step>

        {owner ? (
          <Form method="post" className="grid gap-2">
            {settings.enabled ? (
              <Button
                type="submit"
                name="intent"
                value="disable"
                variant="outline"
                disabled={navigation.state !== "idle"}
              >
                {t("einvoicing.disable")}
              </Button>
            ) : (
              <>
                <Button
                  type="submit"
                  name="intent"
                  value="enable"
                  size="lg"
                  disabled={left > 0 || navigation.state !== "idle"}
                >
                  {t("einvoicing.enable")}
                </Button>
                <p className="text-sm text-muted-foreground">
                  {left > 0 ? t("einvoicing.incomplete") : t("einvoicing.enableHint")}
                </p>
              </>
            )}
            {notice ? (
              <p role={notice === "incomplete" ? "alert" : "status"} className="text-sm">
                {t(`einvoicing.${notice}`)}
              </p>
            ) : null}
          </Form>
        ) : null}

        <OptionsCard loaderData={loaderData} actionData={forIntent("options")} />
        <RecentDocuments recent={loaderData.recent} workspace={params.workspace} />
      </div>
    </>
  );
}

/** One step of the setup: closed with a ✓ when done, open when it's the next one to do. */
function Step({
  id,
  title,
  done,
  open,
  children,
}: {
  id: string;
  title: string;
  done: boolean;
  open: boolean;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <details
      id={`step-${id}`}
      open={open}
      className="group rounded-xl border bg-card text-card-foreground"
    >
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-medium">
        <h2>{title}</h2>
        {done ? (
          <span className="rounded-full border border-primary bg-primary px-2 py-0.5 text-xs text-primary-foreground">
            ✓ {t("einvoicing.stepDone")}
          </span>
        ) : (
          <span aria-hidden className="text-muted-foreground group-open:rotate-180">
            ▾
          </span>
        )}
      </summary>
      <div className="grid gap-4 border-t p-4">{children}</div>
    </details>
  );
}

function IssuerStep({
  loaderData,
  actionData,
}: {
  loaderData: LoaderData;
  actionData: ActionData;
}) {
  const t = useT();
  const navigation = useNavigation();
  const { settings, owner, lookup } = loaderData;
  const found = lookup?.taxpayer ?? null;
  const saved = settings.issuer;
  const [province, setProvince] = useState(saved.district.split("-")[0] ?? "");
  const [form, fields] = useForm({
    id: `issuer-${lookup?.cedula ?? "saved"}`,
    lastResult: actionData?.result,
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: einvoicingIssuerSchema }),
    defaultValue: {
      idNumber: lookup?.cedula ?? saved.idNumber,
      name: found?.name ?? saved.name,
      commercialName: saved.commercialName,
      email: saved.email,
      phone: saved.phone,
      activityCode:
        found && found.activities.length === 1 ? found.activities[0]?.code : saved.activityCode,
      district: saved.district,
      address: saved.address,
    },
  });
  const activities = found?.activities ?? [];
  const districtOptions = loaderData.districts.filter((option) => option.province === province);
  const select = "h-11 w-full rounded-md border bg-background px-3";

  return (
    <>
      <p className="text-sm text-muted-foreground">{t("einvoicing.issuerIntro")}</p>
      {owner ? (
        <Form method="get" className="grid gap-2" preventScrollReset>
          <Label htmlFor="lookup-cedula">{t("einvoicing.lookupLabel")}</Label>
          <div className="flex gap-2">
            <input
              id="lookup-cedula"
              name="cedula"
              inputMode="numeric"
              defaultValue={lookup?.cedula ?? saved.idNumber}
              aria-describedby="lookup-hint"
              className="h-11 min-w-0 flex-1 rounded-md border bg-background px-3"
            />
            <Button type="submit" variant="outline" disabled={navigation.state !== "idle"}>
              {t("einvoicing.lookupButton")}
            </Button>
          </div>
          <p id="lookup-hint" className="text-sm text-muted-foreground">
            {t("einvoicing.lookupHint")}
          </p>
          {lookup ? (
            <p role="status" className="text-sm">
              {found ? t("einvoicing.lookupFound") : t("einvoicing.lookupNotFound")}
            </p>
          ) : null}
        </Form>
      ) : null}
      <Form method="post" className="grid gap-4" {...getFormProps(form)}>
        <input type="hidden" name="intent" value="issuer" />
        <fieldset className="grid gap-4" disabled={!owner}>
          <TextField
            field={fields.idNumber}
            label={t("einvoicing.idNumber")}
            description={t("einvoicing.idNumberHint")}
            inputMode="numeric"
          />
          <TextField field={fields.name} label={t("einvoicing.name")} autoComplete="organization" />
          <TextField field={fields.commercialName} label={t("einvoicing.commercialName")} />
          <TextField
            field={fields.email}
            type="email"
            label={t("einvoicing.email")}
            description={t("einvoicing.emailHint")}
            autoComplete="email"
          />
          <TextField
            field={fields.phone}
            type="tel"
            label={t("einvoicing.phone")}
            placeholder="8888-1234"
            autoComplete="tel"
          />
          {activities.length > 1 ? (
            <div className="grid gap-2">
              <Label htmlFor={fields.activityCode.id}>{t("einvoicing.activity")}</Label>
              <select
                {...getSelectProps(fields.activityCode)}
                key={fields.activityCode.key}
                className={select}
              >
                <option value="">{t("einvoicing.activityPick")}</option>
                {activities.map((activity) => (
                  <option key={activity.code} value={activity.code}>
                    {activity.code} · {activity.description}
                  </option>
                ))}
              </select>
              <FieldErrors id={fields.activityCode.errorId} errors={fields.activityCode.errors} />
            </div>
          ) : (
            <TextField
              field={fields.activityCode}
              label={t("einvoicing.activity")}
              description={t("einvoicing.activityHint")}
              inputMode="numeric"
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="issuer-province">{t("einvoicing.province")}</Label>
              <select
                id="issuer-province"
                value={province}
                onChange={(event) => setProvince(event.target.value)}
                className={select}
              >
                <option value="">{t("einvoicing.province")}</option>
                {loaderData.provinces.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={fields.district.id}>{t("einvoicing.district")}</Label>
              <select
                {...getSelectProps(fields.district)}
                key={`${fields.district.key}-${province}`}
                className={select}
                disabled={!province}
              >
                <option value="">{t("einvoicing.districtPick")}</option>
                {districtOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <FieldErrors id={fields.district.errorId} errors={fields.district.errors} />
            </div>
          </div>
          <TextField
            field={fields.address}
            label={t("einvoicing.address")}
            placeholder={t("einvoicing.addressPlaceholder")}
          />
        </fieldset>
        {owner ? (
          <Button type="submit" disabled={navigation.state !== "idle"}>
            {t("einvoicing.saveIssuer")}
          </Button>
        ) : null}
        {actionData?.done === "issuerSaved" ? (
          <p role="status" className="text-sm">
            {t("einvoicing.issuerSaved")}
          </p>
        ) : null}
      </Form>
    </>
  );
}

function ProductStep({
  loaderData,
  actionData,
}: {
  loaderData: LoaderData;
  actionData: ActionData;
}) {
  const t = useT();
  const navigation = useNavigation();
  const { settings, owner, cabys } = loaderData;
  const [form, fields] = useForm({
    id: "product",
    lastResult: actionData?.result,
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: einvoicingProductSchema }),
    defaultValue: settings.product,
  });

  return (
    <>
      <p className="text-sm text-muted-foreground">{t("einvoicing.productIntro")}</p>
      {settings.product.cabys ? (
        <p className="text-sm">
          {t("einvoicing.cabysChosen", {
            description: settings.product.cabysDescription || settings.product.cabys,
          })}
        </p>
      ) : null}
      {owner ? (
        <Form method="get" className="grid gap-2" preventScrollReset>
          <Label htmlFor="cabys-search">{t("einvoicing.cabysSearch")}</Label>
          <div className="flex gap-2">
            <input
              id="cabys-search"
              type="search"
              name="cabys"
              defaultValue={cabys?.query ?? ""}
              placeholder={t("einvoicing.cabysSearchPlaceholder")}
              className="h-11 min-w-0 flex-1 rounded-md border bg-background px-3"
            />
            <Button type="submit" variant="outline" disabled={navigation.state !== "idle"}>
              {t("einvoicing.cabysSearchButton")}
            </Button>
          </div>
        </Form>
      ) : null}
      {cabys ? (
        cabys.results.length === 0 ? (
          <p role="status" className="text-sm">
            {t("einvoicing.cabysNoResults")}
          </p>
        ) : (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">{t("einvoicing.cabysTaxOnly13")}</p>
            <ul className="grid divide-y rounded-md border">
              {cabys.results.map((item) => (
                <li key={item.code}>
                  <Form method="post" className="flex items-center justify-between gap-3 p-3">
                    <input type="hidden" name="intent" value="product" />
                    <input type="hidden" name="cabys" value={item.code} />
                    <input type="hidden" name="cabysDescription" value={item.description} />
                    <span className="grid text-sm">
                      <span>{item.description}</span>
                      <span className="text-muted-foreground">
                        {item.code} · {t("einvoicing.cabysTax", { tax: String(item.tax) })}
                      </span>
                    </span>
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={item.tax !== 13 || navigation.state !== "idle"}
                    >
                      {t("einvoicing.saveProduct")}
                    </Button>
                  </Form>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}
      <Form method="post" className="grid gap-4" {...getFormProps(form)}>
        <input type="hidden" name="intent" value="product" />
        <fieldset className="grid gap-4" disabled={!owner}>
          <TextField
            field={fields.cabys}
            label={t("einvoicing.cabysCode")}
            description={t("einvoicing.cabysCodeHint")}
            inputMode="numeric"
          />
          <input
            {...getInputProps(fields.cabysDescription, { type: "hidden" })}
            key={fields.cabysDescription.key}
          />
        </fieldset>
        {owner ? (
          <Button type="submit" variant="outline" disabled={navigation.state !== "idle"}>
            {t("einvoicing.saveProduct")}
          </Button>
        ) : null}
        {actionData?.done === "productSaved" ? (
          <p role="status" className="text-sm">
            {t("einvoicing.productSaved")}
          </p>
        ) : null}
      </Form>
    </>
  );
}

function CredentialsStep({
  loaderData,
  actionData,
}: {
  loaderData: LoaderData;
  actionData: ActionData;
}) {
  const t = useT();
  const locale = useLocale();
  const navigation = useNavigation();
  const { settings, owner } = loaderData;
  const saved = settings.credentials;
  const [form, fields] = useForm({
    id: "credentials",
    lastResult: actionData?.result,
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: einvoicingCredentialsSchema }),
    defaultValue: { haciendaUsername: saved.haciendaUsername },
  });

  return (
    <>
      <p className="text-sm text-muted-foreground">{t("einvoicing.credentialsIntro")}</p>
      {saved.hasCertificate && saved.certificateExpiresAt ? (
        <p className="text-sm">
          {t("einvoicing.certificateSaved", {
            subject: saved.certificateSubject ?? "",
            date: new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
              new Date(saved.certificateExpiresAt),
            ),
          })}
        </p>
      ) : null}
      <Form
        method="post"
        encType="multipart/form-data"
        className="grid gap-4"
        {...getFormProps(form)}
      >
        <input type="hidden" name="intent" value="credentials" />
        <fieldset className="grid gap-4" disabled={!owner}>
          <TextField
            field={fields.haciendaUsername}
            type="email"
            label={t("einvoicing.haciendaUsername")}
            description={t("einvoicing.haciendaUsernameHint")}
            autoCapitalize="none"
            spellCheck={false}
            autoComplete="username"
          />
          <TextField
            field={fields.haciendaPassword}
            type="password"
            label={t("einvoicing.haciendaPassword")}
            description={saved.hasPassword ? t("einvoicing.keepSaved") : undefined}
            autoComplete="current-password"
          />
          <div className="grid gap-2">
            <Label htmlFor={fields.certificate.id}>{t("einvoicing.certificate")}</Label>
            <input
              {...getInputProps(fields.certificate, { type: "file" })}
              key={fields.certificate.key}
              accept=".p12,application/x-pkcs12"
              aria-describedby={saved.hasCertificate ? "certificate-keep" : undefined}
              className="min-h-11 rounded-md border bg-background px-3 py-2 text-sm"
            />
            {saved.hasCertificate ? (
              <p id="certificate-keep" className="text-sm text-muted-foreground">
                {t("einvoicing.keepSaved")}
              </p>
            ) : null}
            <FieldErrors id={fields.certificate.errorId} errors={fields.certificate.errors} />
          </div>
          <TextField
            field={fields.certificatePin}
            type="password"
            inputMode="numeric"
            maxLength={4}
            label={t("einvoicing.certificatePin")}
            description={saved.hasCertificate ? t("einvoicing.keepSaved") : undefined}
            autoComplete="off"
          />
        </fieldset>
        <FieldErrors id={form.errorId} errors={form.errors} />
        <p className="text-sm text-muted-foreground">{t("einvoicing.credentialsHelp")}</p>
        {owner ? (
          <Button type="submit" disabled={navigation.state !== "idle"}>
            {t("einvoicing.saveCredentials")}
          </Button>
        ) : null}
        {actionData?.done === "credentialsSaved" ? (
          <p role="status" className="text-sm">
            {t("einvoicing.credentialsSaved")}
          </p>
        ) : null}
      </Form>
    </>
  );
}

function OptionsCard({
  loaderData,
  actionData,
}: {
  loaderData: LoaderData;
  actionData: ActionData;
}) {
  const t = useT();
  const navigation = useNavigation();
  const { settings, owner } = loaderData;
  const [form, fields] = useForm({
    id: "options",
    lastResult: actionData?.result,
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: einvoicingOptionsSchema }),
    defaultValue: {
      autoIssue: settings.autoIssue ? "on" : undefined,
      branch: String(settings.branch),
      terminal: String(settings.terminal),
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("einvoicing.optionsHeading")}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form method="post" className="grid gap-4" {...getFormProps(form)}>
          <input type="hidden" name="intent" value="options" />
          <fieldset className="grid gap-4" disabled={!owner}>
            <div className="grid gap-1">
              <div className="flex min-h-11 items-center gap-3">
                <input
                  {...getInputProps(fields.autoIssue, { type: "checkbox" })}
                  key={fields.autoIssue.key}
                  className="size-5 accent-primary"
                />
                <Label htmlFor={fields.autoIssue.id} className="font-medium">
                  {t("einvoicing.autoIssue")}
                </Label>
              </div>
              <p className="text-sm text-muted-foreground">{t("einvoicing.autoIssueHint")}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <TextField
                field={fields.branch}
                type="number"
                label={t("einvoicing.branch")}
                min={1}
                max={999}
              />
              <TextField
                field={fields.terminal}
                type="number"
                label={t("einvoicing.terminal")}
                min={1}
                max={99999}
              />
            </div>
            <p className="text-sm text-muted-foreground">{t("einvoicing.numberingHint")}</p>
          </fieldset>
          {owner ? (
            <Button type="submit" variant="outline" disabled={navigation.state !== "idle"}>
              {t("einvoicing.saveOptions")}
            </Button>
          ) : null}
          {actionData?.done === "optionsSaved" ? (
            <p role="status" className="text-sm">
              {t("einvoicing.optionsSaved")}
            </p>
          ) : null}
        </Form>
      </CardContent>
    </Card>
  );
}

function RecentDocuments({
  recent,
  workspace,
}: {
  recent: LoaderData["recent"];
  workspace: string;
}) {
  const t = useT();
  const locale = useLocale();
  return (
    <section aria-labelledby="documents" className="grid gap-3">
      <h2 id="documents" className="text-lg font-medium">
        {t("einvoicing.documentsHeading")}
      </h2>
      {recent.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("einvoicing.documentsEmpty")}</p>
      ) : (
        <ul className="grid divide-y rounded-md border">
          {recent.map((doc) => (
            <li key={doc.id} className="grid gap-1 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  to={href("/app/:workspace/orders/:number", {
                    workspace,
                    number: String(doc.orderNumber),
                  })}
                  className="inline-flex min-h-11 items-center font-medium underline underline-offset-4"
                >
                  {t("einvoicing.orderLink", { number: String(doc.orderNumber) })}
                </Link>
                <span className="flex items-center gap-2">
                  {doc.environment === "sandbox" ? (
                    <span className="rounded-full border px-2 py-0.5 text-xs">
                      {t("einvoicing.sandboxBadge")}
                    </span>
                  ) : null}
                  <EinvoiceStatusBadge status={doc.status} />
                </span>
              </div>
              <p className="text-sm">
                {t(`einvoicing.kind_${doc.kind}`)} · {doc.consecutive}
                {doc.receiverName ? ` · ${doc.receiverName}` : ""} ·{" "}
                {formatPrice(doc.total, doc.currency, locale)}
              </p>
              <EinvoiceProblem einvoice={doc} />
              <EinvoiceDownloads workspace={workspace} einvoice={doc} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
