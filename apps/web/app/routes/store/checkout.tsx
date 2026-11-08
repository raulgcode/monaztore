import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { checkoutSchema } from "@monaztore/contracts";
import { DomainError, getPaymentOptions, placeOrder, priceCart } from "@monaztore/core";
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

export function meta({ matches }: Route.MetaArgs) {
  return [
    { title: metaT(matches)("storefront.checkoutHeading") },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const store = requireStore(context);
  const [cart, payments] = await Promise.all([
    readCart(request).then((lines) => priceCart(store, lines)),
    getPaymentOptions(store),
  ]);
  if (cart.lines.length === 0) throw redirect(href("/cart"));
  return {
    cart,
    methods: (["sinpe", "transfer"] as const).filter((method) => payments[method]),
    i18n: translations(context, "forms"),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const store = requireStore(context);
  const submission = parseWithZod(await request.formData(), { schema: checkoutSchema });
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
      cart: await readCart(request),
      checkout: submission.value,
      locale: localeOf(context),
    });
    throw redirect(href("/orders/:token", { token: placed.token }), {
      headers: { "Set-Cookie": await cartCookieHeader([]) },
    });
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    if (error.code === "cart_changed" || error.code === "cart_empty") {
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

export default function Checkout({ loaderData, actionData }: Route.ComponentProps) {
  const t = useT();
  const locale = useLocale();
  const navigation = useNavigation();
  const placing = navigation.state === "submitting";
  const { cart, methods } = loaderData;
  const money = (minor: number) => formatPrice(minor, cart.currency, locale);
  const [form, fields] = useForm({
    id: "checkout",
    lastResult: actionData?.result,
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: checkoutSchema }),
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
            <Button type="submit" size="lg" disabled={placing}>
              {placing ? t("storefront.placingOrder") : t("storefront.placeOrder")}
            </Button>
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
