import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  checkoutSchema,
  checkoutWithInvoiceSchema,
  digitalCheckoutSchema,
  digitalCheckoutWithInvoiceSchema,
  taxIdFromForm,
} from "@monaztore/contracts";
import {
  DomainError,
  getPaymentOptions,
  placeOrder,
  priceCart,
  storeIssuesInvoices,
} from "@monaztore/core";
import { data, Form, href, Link, redirect, useNavigation } from "react-router";
import { FieldErrors, TextField } from "~/components/text-field";
import { Button } from "~/components/ui/button";
import { cartCookieHeader, readCart } from "~/lib/cart.server";
import { metaT, useLocale, useT } from "~/lib/i18n";
import { localeOf, translations } from "~/lib/locale.server";
import { formatPrice } from "~/lib/money";
import { requestAddress, withinRateLimits } from "~/lib/rate-limit.server";
import { requireStore } from "~/middleware/store.server";
import type { Route } from "./+types/checkout";

/** The form's schema: no address for a cart of downloads, "invoice in my name" where it applies. */
function schemaFor({ invoices, needsShipping }: { invoices: boolean; needsShipping: boolean }) {
  if (needsShipping) return invoices ? checkoutWithInvoiceSchema : checkoutSchema;
  return invoices ? digitalCheckoutWithInvoiceSchema : digitalCheckoutSchema;
}

export function meta({ matches }: Route.MetaArgs) {
  return [
    { title: metaT(matches)("storefront.checkoutHeading") },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const store = requireStore(context);
  const [cart, payments, invoices] = await Promise.all([
    readCart(request).then((lines) => priceCart(store, lines)),
    getPaymentOptions(store),
    storeIssuesInvoices(store.db, store.store.organizationId),
  ]);
  if (cart.lines.length === 0) throw redirect(href("/cart"));
  return {
    cart,
    methods: (["sinpe", "transfer"] as const).filter((method) => payments[method]),
    // A store in Costa Rica with electronic invoicing on asks who the invoice is for.
    invoices,
    i18n: translations(context, "forms"),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const store = requireStore(context);
  const [invoices, cart] = await Promise.all([
    storeIssuesInvoices(store.db, store.store.organizationId),
    readCart(request),
  ]);
  const { needsShipping } = await priceCart(store, cart);
  const submission = parseWithZod(await request.formData(), {
    schema: schemaFor({ invoices, needsShipping }),
  });
  if (submission.status !== "success") {
    return data({ result: submission.reply(), cartChanged: false }, { status: 400 });
  }
  if (!(await withinRateLimits([["orderIp", requestAddress(request)]]))) {
    return data(
      {
        result: submission.reply({ formErrors: ["forms.tooManyAttempts"] }),
        cartChanged: false,
      },
      { status: 429 },
    );
  }
  try {
    const placed = await placeOrder(store, {
      cart,
      checkout: submission.value,
      taxId: invoiceTo(submission.value),
      locale: localeOf(context),
    });
    throw redirect(href("/orders/:token", { token: placed.token }), {
      headers: { "Set-Cookie": await cartCookieHeader([]) },
    });
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    // The cart changed in another tab (a product to ship added): the page asks for the address.
    if (
      error.code === "cart_changed" ||
      error.code === "cart_empty" ||
      error.code === "address_required"
    ) {
      return data({ result: submission.reply(), cartChanged: true }, { status: 409 });
    }
    if (error.code === "payment_method_unavailable") {
      return data(
        {
          result: submission.reply({
            fieldErrors: { paymentMethod: ["forms.paymentMethodRequired"] },
          }),
          cartChanged: false,
        },
        { status: 400 },
      );
    }
    throw error;
  }
}

/** The "invoice in my name" fields as the order's `taxId`, when the form had them. */
function invoiceTo(value: object) {
  if (!("taxIdNumber" in value && "taxName" in value)) return null;
  const { taxIdNumber, taxName } = value;
  return typeof taxIdNumber === "string" && typeof taxName === "string"
    ? taxIdFromForm({ taxIdNumber, taxName })
    : null;
}

export default function Checkout({ loaderData, actionData }: Route.ComponentProps) {
  const t = useT();
  const locale = useLocale();
  const navigation = useNavigation();
  const placing = navigation.state === "submitting";
  const { cart, methods, invoices } = loaderData;
  const money = (minor: number) => formatPrice(minor, cart.currency, locale);
  const [form, fields] = useForm({
    id: "checkout",
    lastResult: actionData?.result,
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    onValidate: ({ formData }) =>
      parseWithZod(formData, {
        schema: schemaFor({ invoices, needsShipping: cart.needsShipping }),
      }),
    defaultValue: { paymentMethod: methods[0] },
  });

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        {t("storefront.checkoutHeading")}
      </h1>
      {actionData?.cartChanged ? (
        <p role="alert" className="mb-4 rounded-md border border-destructive p-3 text-sm">
          {t("storefront.cartChanged")}{" "}
          <Link to={href("/cart")} className="underline underline-offset-4">
            {t("storefront.viewCart")}
          </Link>
        </p>
      ) : null}
      <div className="grid gap-8 md:grid-cols-[1fr_20rem] md:items-start">
        {methods.length === 0 ? (
          <p role="alert" className="rounded-md border p-4">
            {t("storefront.noPaymentMethods")}
          </p>
        ) : (
          <Form method="post" className="grid gap-8" {...getFormProps(form)}>
            <fieldset className="grid gap-4">
              <legend className="mb-2 text-lg font-medium">{t("storefront.contactSection")}</legend>
              <TextField
                field={fields.email}
                type="email"
                label={t("storefront.emailLabel")}
                autoComplete="email"
              />
              <TextField
                field={fields.name}
                label={t("storefront.nameLabel")}
                autoComplete="name"
              />
              <TextField
                field={fields.phone}
                type="tel"
                label={t("storefront.phoneLabel")}
                autoComplete="tel"
              />
            </fieldset>
            {cart.needsShipping ? (
              <fieldset className="grid gap-4">
                <legend className="mb-2 text-lg font-medium">
                  {t("storefront.shippingSection")}
                </legend>
                <TextField
                  field={fields.line1}
                  label={t("storefront.addressLabel")}
                  description={t("storefront.addressHint")}
                  autoComplete="street-address"
                />
                <TextField
                  field={fields.city}
                  label={t("storefront.cityLabel")}
                  autoComplete="address-level2"
                />
                <TextField
                  field={fields.province}
                  label={t("storefront.provinceLabel")}
                  autoComplete="address-level1"
                />
                <TextField field={fields.notes} label={t("storefront.notesLabel")} />
              </fieldset>
            ) : (
              <p role="note" className="rounded-md border p-3 text-sm">
                {t("storefront.digitalCheckout")}
              </p>
            )}
            {invoices ? <InvoiceTo fields={fields} /> : null}
            <fieldset
              className="grid gap-3"
              aria-describedby={
                fields.paymentMethod.errors ? fields.paymentMethod.errorId : undefined
              }
            >
              <legend className="mb-2 text-lg font-medium">{t("storefront.paymentSection")}</legend>
              {methods.map((method) => (
                <label
                  key={method}
                  className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border p-3 has-[:checked]:border-primary"
                >
                  <input
                    type="radio"
                    name={fields.paymentMethod.name}
                    value={method}
                    defaultChecked={fields.paymentMethod.initialValue === method}
                    className="mt-1 size-4 accent-primary"
                  />
                  <span className="grid gap-0.5">
                    <span className="font-medium">{t(`storefront.${method}`)}</span>
                    <span className="text-sm text-muted-foreground">
                      {t(`storefront.${method}Hint`)}
                    </span>
                  </span>
                </label>
              ))}
              <FieldErrors id={fields.paymentMethod.errorId} errors={fields.paymentMethod.errors} />
            </fieldset>
            <FieldErrors id={form.errorId} errors={form.errors} />
            {/* On the phone it stays at the bottom while the form scrolls, within the thumb's reach. */}
            <div className="sticky bottom-0 z-20 -mx-4 grid border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:static md:mx-0 md:border-0 md:p-0">
              <Button type="submit" size="lg" disabled={placing}>
                {placing ? t("storefront.placingOrder") : t("storefront.placeOrder")}
              </Button>
            </div>
          </Form>
        )}
        <section
          aria-labelledby="summary"
          className="grid gap-3 rounded-md border p-4 md:order-last"
        >
          <h2 id="summary" className="font-medium">
            {t("storefront.orderSummary")}
          </h2>
          <ul className="grid gap-2 text-sm">
            {cart.lines.map((line) => (
              <li
                key={`${line.productId}:${line.variantId}`}
                className="flex justify-between gap-2"
              >
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
            <span>{money(cart.subtotal)}</span>
          </p>
        </section>
      </div>
    </>
  );
}

type CheckoutFields = ReturnType<typeof useForm<Record<string, string>>>[1];

/** "Invoice in my name": closed by default, open again when one of its fields has an error. */
function InvoiceTo({ fields }: { fields: CheckoutFields }) {
  const t = useT();
  const idNumber = fields.taxIdNumber;
  const name = fields.taxName;
  if (!idNumber || !name) return null;
  return (
    <details
      className="rounded-md border p-3"
      open={Boolean(idNumber.errors || name.errors || idNumber.initialValue)}
    >
      <summary className="flex min-h-11 cursor-pointer items-center font-medium">
        {t("storefront.invoiceSection")}
      </summary>
      <div className="grid gap-4 pt-3">
        <p className="text-sm text-muted-foreground">{t("storefront.invoiceSectionHint")}</p>
        <TextField field={idNumber} label={t("storefront.invoiceIdLabel")} inputMode="numeric" />
        <TextField
          field={name}
          label={t("storefront.invoiceNameLabel")}
          autoComplete="organization"
        />
      </div>
    </details>
  );
}
