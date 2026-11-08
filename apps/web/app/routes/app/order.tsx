import { parseWithZod } from "@conform-to/zod/v4";
import { invoiceToSchema, taxIdFromForm } from "@monaztore/contracts";
import {
  cancelOrder,
  DomainError,
  getEinvoicing,
  getOrder,
  getOrderEinvoices,
  issueOrderEinvoice,
  markOrderPaid,
  retryEinvoice,
} from "@monaztore/core";
import { data, Form, href, Link, useNavigation } from "react-router";
import { OrderEinvoice } from "~/components/einvoicing/order-einvoice";
import { OrderStatusBadge } from "~/components/orders/order-status";
import { PageHeader } from "~/components/page-header";
import { Button } from "~/components/ui/button";
import { tenantContext } from "~/context";
import { metaT, useLocale, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { formatPrice } from "~/lib/money";
import type { Route } from "./+types/order";

export function meta({ matches, params }: Route.MetaArgs) {
  return [{ title: metaT(matches)("orders.orderTitle", { number: params.number }) }];
}

function orderNumber(param: string): number {
  const number = Number(param);
  if (!Number.isSafeInteger(number) || number <= 0) throw data("Order not found", { status: 404 });
  return number;
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const tenant = context.get(tenantContext);
  const number = orderNumber(params.number);
  const [order, einvoicing] = await Promise.all([getOrder(tenant, number), getEinvoicing(tenant)]);
  if (!order) throw data("Order not found", { status: 404 });
  // Electronic invoicing only shows in Costa Rica, once it was turned on or an order has one.
  const einvoices = einvoicing.available ? await getOrderEinvoices(tenant, number) : [];
  const showEinvoices = einvoicing.available && (einvoicing.enabled || einvoices.length > 0);
  return {
    order,
    einvoicing: showEinvoices ? { enabled: einvoicing.enabled, einvoices } : null,
    i18n: showEinvoices
      ? translations(context, "orders", "einvoicing", "forms")
      : translations(context, "orders"),
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const tenant = context.get(tenantContext);
  const number = orderNumber(params.number);
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent === "einvoice") {
    const submission = parseWithZod(formData, { schema: invoiceToSchema });
    if (submission.status !== "success") {
      return data({ done: null, result: submission.reply() }, { status: 400 });
    }
    try {
      await issueOrderEinvoice(tenant, number, taxIdFromForm(submission.value));
    } catch (error) {
      if (error instanceof DomainError && error.code === "einvoice_exists") {
        return data({ done: "einvoiceExists" as const, result: undefined }, { status: 409 });
      }
      if (error instanceof DomainError) {
        return data({ done: "einvoiceOff" as const, result: undefined }, { status: 409 });
      }
      throw error;
    }
    return { done: "einvoiceIssued" as const, result: submission.reply({ resetForm: true }) };
  }
  if (intent === "einvoiceRetry") {
    try {
      await retryEinvoice(tenant, String(formData.get("id") ?? ""));
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
    }
    return { done: "einvoiceRetried" as const, result: undefined };
  }
  try {
    if (intent === "paid") await markOrderPaid(tenant, number);
    else if (intent === "cancel") await cancelOrder(tenant, number);
    else throw data("Unknown intent", { status: 400 });
    return {
      done: intent === "paid" ? ("paid" as const) : ("cancelled" as const),
      result: undefined,
    };
  } catch (error) {
    if (error instanceof DomainError && error.code === "order_closed") {
      return data({ done: "closed" as const, result: undefined }, { status: 409 });
    }
    throw error;
  }
}

export default function Order({ loaderData, actionData, params }: Route.ComponentProps) {
  const t = useT();
  const locale = useLocale();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const { order } = loaderData;
  const money = (minor: number) => formatPrice(minor, order.currency, locale);
  const open = order.status === "pending_payment" || order.status === "payment_submitted";
  const notice = {
    paid: t("orders.paidDone"),
    cancelled: t("orders.cancelledDone"),
    closed: t("orders.closed"),
    einvoiceIssued: loaderData.einvoicing ? t("einvoicing.issued") : "",
    einvoiceRetried: loaderData.einvoicing ? t("einvoicing.retried") : "",
    einvoiceExists: loaderData.einvoicing ? t("einvoicing.orderExists") : "",
    einvoiceOff: loaderData.einvoicing ? t("einvoicing.orderOff") : "",
  };
  const alerts = new Set(["closed", "einvoiceExists", "einvoiceOff"]);

  return (
    <>
      <Link
        to={href("/app/:workspace/orders", { workspace: params.workspace })}
        className="mb-4 inline-flex min-h-11 items-center text-sm underline underline-offset-4"
      >
        ← {t("orders.back")}
      </Link>
      <PageHeader
        title={t("orders.orderTitle", { number: String(order.number) })}
        description={t("orders.placedOn", {
          date: new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(
            new Date(order.createdAt),
          ),
        })}
      >
        <OrderStatusBadge status={order.status} />
      </PageHeader>
      {actionData?.done ? (
        <p
          role={alerts.has(actionData.done) ? "alert" : "status"}
          className="mb-4 rounded-md border p-3 text-sm"
        >
          {notice[actionData.done]}
        </p>
      ) : null}
      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="payment" className="grid gap-2 rounded-md border p-4">
          <h2 id="payment" className="font-medium">
            {t("orders.payment")}
          </h2>
          <p>{t(`orders.method_${order.paymentMethod}`)}</p>
          <p className="text-sm">
            {order.paymentReference
              ? t("orders.reference", { reference: order.paymentReference })
              : t("orders.noReference")}
          </p>
          {open ? (
            <div className="mt-2 grid gap-3">
              <Form method="post" className="grid gap-1">
                <Button type="submit" name="intent" value="paid" disabled={busy}>
                  {t("orders.markPaid")}
                </Button>
                <p className="text-sm text-muted-foreground">{t("orders.markPaidHint")}</p>
              </Form>
              <Form method="post" className="grid gap-1">
                <Button
                  type="submit"
                  name="intent"
                  value="cancel"
                  variant="outline"
                  disabled={busy}
                >
                  {t("orders.cancel")}
                </Button>
                <p className="text-sm text-muted-foreground">{t("orders.cancelHint")}</p>
              </Form>
            </div>
          ) : null}
        </section>
        <section
          aria-labelledby="customer"
          className="grid content-start gap-1 rounded-md border p-4"
        >
          <h2 id="customer" className="mb-1 font-medium">
            {t("orders.customer")}
          </h2>
          <p>{order.name}</p>
          <p className="break-all text-sm">
            <a href={`mailto:${order.email}`} className="underline underline-offset-4">
              {order.email}
            </a>
          </p>
          <p className="text-sm">
            <a href={`tel:${order.phone}`} className="underline underline-offset-4">
              {order.phone}
            </a>
          </p>
          <h2 className="mt-3 mb-1 font-medium">{t("orders.delivery")}</h2>
          <p className="text-sm">{order.shippingAddress.line1}</p>
          <p className="text-sm">
            {order.shippingAddress.city}, {order.shippingAddress.province}
          </p>
          {order.shippingAddress.notes ? (
            <p className="text-sm text-muted-foreground">{order.shippingAddress.notes}</p>
          ) : null}
        </section>
        <section aria-labelledby="items" className="grid gap-3 rounded-md border p-4 md:col-span-2">
          <h2 id="items" className="font-medium">
            {t("orders.items")}
          </h2>
          <ul className="grid gap-2 text-sm">
            {order.lines.map((line, index) => (
              <li key={`${index}:${line.name}`} className="flex justify-between gap-2">
                <span>
                  {line.quantity} × {line.name}
                  {line.variantTitle ? ` (${line.variantTitle})` : ""}
                  {line.sku ? <span className="text-muted-foreground"> · {line.sku}</span> : null}
                </span>
                <span>{money(line.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <p className="flex justify-between border-t pt-3 font-semibold">
            <span>{t("orders.total")}</span>
            <span>{money(order.total)}</span>
          </p>
        </section>
        {loaderData.einvoicing ? (
          <OrderEinvoice
            workspace={params.workspace}
            paid={order.status === "paid"}
            einvoices={loaderData.einvoicing.einvoices}
            taxId={order.taxId}
            lastResult={actionData?.result}
          />
        ) : null}
      </div>
    </>
  );
}
