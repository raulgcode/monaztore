import { getFormProps, type SubmissionResult, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { invoiceToSchema } from "@monaztore/contracts";
import type { EinvoiceRow } from "@monaztore/core";
import { Form, href, Link, useNavigation } from "react-router";
import { TextField } from "~/components/text-field";
import { Button } from "~/components/ui/button";
import { useT } from "~/lib/i18n";
import { EinvoiceDownloads, EinvoiceProblem, EinvoiceStatusBadge } from "./einvoice-status";

/** The order's electronic documents in the workspace: their state, retry, and issue one. */
export function OrderEinvoice({
  workspace,
  paid,
  einvoices,
  taxId,
  lastResult,
}: {
  workspace: string;
  paid: boolean;
  einvoices: EinvoiceRow[];
  taxId: { idNumber: string; name: string } | null;
  lastResult?: SubmissionResult<string[]>;
}) {
  const t = useT();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  // A rejected document can be replaced by a new one; anything else still stands.
  const standing = einvoices.some((doc) => doc.status !== "rejected");
  const [form, fields] = useForm({
    id: "einvoice",
    lastResult,
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: invoiceToSchema }),
    defaultValue: { taxIdNumber: taxId?.idNumber ?? "", taxName: taxId?.name ?? "" },
  });

  return (
    <section aria-labelledby="einvoice" className="grid gap-3 rounded-md border p-4 md:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="einvoice" className="font-medium">
          {t("einvoicing.orderHeading")}
        </h2>
        <Link
          to={href("/app/:workspace/invoicing", { workspace })}
          className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
        >
          {t("einvoicing.open")}
        </Link>
      </div>
      {einvoices.length === 0 ? (
        <p className="text-sm">{paid ? t("einvoicing.orderNone") : t("einvoicing.orderNotPaid")}</p>
      ) : (
        <ul className="grid gap-3">
          {einvoices.map((doc) => (
            <li key={doc.id} className="grid gap-1 rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{t(`einvoicing.kind_${doc.kind}`)}</span>
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
                {t("einvoicing.consecutive", { consecutive: doc.consecutive })}
                {doc.receiverName ? ` · ${doc.receiverName}` : ""}
              </p>
              <p className="break-all text-xs text-muted-foreground">
                {t("einvoicing.clave", { clave: doc.clave })}
              </p>
              <EinvoiceProblem einvoice={doc} />
              {doc.status === "failed" ? (
                <Form method="post">
                  <input type="hidden" name="id" value={doc.id} />
                  <Button
                    type="submit"
                    name="intent"
                    value="einvoiceRetry"
                    variant="outline"
                    disabled={busy}
                  >
                    {t("einvoicing.retry")}
                  </Button>
                </Form>
              ) : null}
              <EinvoiceDownloads workspace={workspace} einvoice={doc} />
            </li>
          ))}
        </ul>
      )}
      {paid && !standing ? (
        <Form method="post" className="grid gap-4" {...getFormProps(form)}>
          <input type="hidden" name="intent" value="einvoice" />
          {taxId ? (
            <p className="text-sm">
              {t("einvoicing.shopperAsked", { name: taxId.name, id: taxId.idNumber })}
            </p>
          ) : null}
          <fieldset className="grid gap-4">
            <legend className="mb-2 text-sm font-medium">{t("einvoicing.issueTo")}</legend>
            <TextField
              field={fields.taxIdNumber}
              label={t("einvoicing.taxIdNumber")}
              description={t("einvoicing.issueToHint")}
              inputMode="numeric"
            />
            <TextField field={fields.taxName} label={t("einvoicing.taxName")} />
          </fieldset>
          <Button type="submit" disabled={busy}>
            {einvoices.length ? t("einvoicing.issueAgain") : t("einvoicing.issue")}
          </Button>
        </Form>
      ) : null}
    </section>
  );
}
