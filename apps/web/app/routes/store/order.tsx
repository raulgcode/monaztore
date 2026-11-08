import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { paymentReferenceSchema } from "@monaztore/contracts";
import { DomainError, getOrderByToken, submitPaymentReference } from "@monaztore/core";
import { data, Form, href, useNavigation } from "react-router";
import { FieldErrors, TextField } from "~/components/text-field";
import { Button } from "~/components/ui/button";
import { metaT, useLocale, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { formatPrice } from "~/lib/money";
import { requestAddress, withinRateLimits } from "~/lib/rate-limit.server";
import { requireStore } from "~/middleware/store.server";
import type { Route } from "./+types/order";

export function meta({ loaderData, matches }: Route.MetaArgs) {
  if (!loaderData) return [];
  return [
    { title: metaT(matches)("storefront.orderTitle", { number: String(loaderData.order.number) }) },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const store = requireStore(context);
  const order = await getOrderByToken(store, params.token);
  if (!order) throw data("Order not found", { status: 404 });
  return { order, i18n: translations(context, "forms") };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const store = requireStore(context);
  const submission = parseWithZod(await request.formData(), { schema: paymentReferenceSchema });
  if (submission.status !== "success") return data({ result: submission.reply() }, { status: 400 });
  if (!(await withinRateLimits([["paymentReferenceIp", requestAddress(request)]]))) {
    return data(
      { result: submission.reply({ formErrors: ["forms.tooManyAttempts"] }) },
      { status: 429 },
    );
  }
  try {
    await submitPaymentReference(store, params.token, submission.value.reference);
  } catch (error) {
    if (error instanceof DomainError && error.code === "not_found") {
      throw data("Order not found", { status: 404 });
    }
    // Paid or cancelled meanwhile: the page shows the new state.
    if (!(error instanceof DomainError && error.code === "order_closed")) throw error;
  }
  return data({ result: submission.reply({ resetForm: true }) });
}

export default function Order({ loaderData, actionData, params }: Route.ComponentProps) {
  const t = useT();
  const locale = useLocale();
  const navigation = useNavigation();
  const { order } = loaderData;
  const money = (minor: number) => formatPrice(minor, order.currency, locale);
  const open = order.status === "pending_payment" || order.status === "payment_submitted";
  const [form, fields] = useForm({
    id: "payment-reference",
    lastResult: actionData?.result,
    shouldValidate: "onBlur",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: paymentReferenceSchema }),
  });
  const number = String(order.number);

  return (
    <div className="mx-auto grid max-w-xl gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("storefront.orderTitle", { number })}
        </h1>
        <p>{t("storefront.orderThanks", { name: order.name })}</p>
        <p role="status" className="font-medium">
          {t(`storefront.orderStatus_${order.status}`)}
        </p>
      </div>

      {order.status === "pending_payment" ? (
        <section aria-labelledby="pay" className="grid gap-2 rounded-md border border-primary p-4">
          <h2 id="pay" className="text-lg font-semibold">
            {t("storefront.payNow", { amount: money(order.total) })}
          </h2>
          {order.payTo.sinpe ? <p>{t("storefront.sinpeTo", order.payTo.sinpe)}</p> : null}
          {order.payTo.transfer ? <p>{t("storefront.transferTo", order.payTo.transfer)}</p> : null}
          <p className="text-sm text-muted-foreground">
            {t("storefront.payDescription", { number })}
          </p>
        </section>
      ) : null}

      {order.paymentReference ? (
        <p className="text-sm">
          {t("storefront.yourReference", { reference: order.paymentReference })}
        </p>
      ) : null}

      {open ? (
        <Form method="post" className="grid gap-3" {...getFormProps(form)}>
          <TextField
            field={fields.reference}
            label={t("storefront.referenceLabel")}
            description={t("storefront.referenceHint")}
            inputMode="numeric"
            autoComplete="off"
          />
          <FieldErrors id={form.errorId} errors={form.errors} />
          <Button type="submit" size="lg" disabled={navigation.state === "submitting"}>
            {t("storefront.sendReference")}
          </Button>
        </Form>
      ) : null}

      <section aria-labelledby="summary" className="grid gap-3">
        <h2 id="summary" className="font-medium">
          {t("storefront.orderSummary")}
        </h2>
        <ul className="grid gap-2 text-sm">
          {order.lines.map((line, index) => (
            <li key={index} className="flex justify-between gap-2">
              <span>
                {line.quantity} × {line.name}
                {line.variantTitle ? ` (${line.variantTitle})` : ""}
              </span>
              <span>{money(line.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <p className="flex justify-between border-t pt-3 font-semibold">
          <span>{t("storefront.total")}</span>
          <span>{money(order.total)}</span>
        </p>
      </section>

      <section aria-labelledby="deliver" className="grid gap-1 text-sm">
        <h2 id="deliver" className="font-medium">
          {t("storefront.deliverTo")}
        </h2>
        <p>{order.shippingAddress.line1}</p>
        <p>
          {order.shippingAddress.city}, {order.shippingAddress.province}
        </p>
      </section>
      {order.einvoice ? (
        <section aria-labelledby="einvoice" className="grid gap-1 rounded-md border p-4 text-sm">
          <h2 id="einvoice" className="font-medium">
            {t("storefront.einvoiceHeading")}
          </h2>
          <p>{t("storefront.einvoiceIntro")}</p>
          <p>
            {t(
              order.einvoice.kind === "invoice"
                ? "storefront.einvoiceInvoice"
                : "storefront.einvoiceTicket",
              {
                consecutive: order.einvoice.consecutive,
              },
            )}
          </p>
          <div className="flex flex-wrap gap-x-4">
            {(["document", "response"] as const).map((file) => (
              <a
                key={file}
                href={href("/orders/:token/:file", { token: params.token, file: `${file}.xml` })}
                className="inline-flex min-h-11 items-center underline underline-offset-4"
              >
                {t(
                  file === "document"
                    ? "storefront.einvoiceDocument"
                    : "storefront.einvoiceResponse",
                )}
              </a>
            ))}
          </div>
        </section>
      ) : null}
      <p className="text-sm text-muted-foreground">{t("storefront.orderLinkHint")}</p>
    </div>
  );
}
