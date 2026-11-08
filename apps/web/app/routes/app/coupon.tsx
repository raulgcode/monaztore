import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { couponFormSchema, couponInputOf, dayOf, minorToPrice } from "@monaztore/contracts";
import {
  catalogSettings,
  DomainError,
  deleteCoupon,
  getCoupon,
  listCategories,
  NotFoundError,
  saveCoupon,
  searchProducts,
} from "@monaztore/core";
import { ArrowLeftIcon, SearchIcon, ShuffleIcon, Trash2Icon, XIcon } from "lucide-react";
import { useId, useState } from "react";
import { data, Form, href, Link, redirect, useFetcher, useSearchParams } from "react-router";
import { PageHeader } from "~/components/page-header";
import { FieldErrors, TextField } from "~/components/text-field";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { tenantContext } from "~/context";
import { metaT, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/coupon";
import type { loader as searchLoader } from "./product-search";

export function meta({ matches, loaderData }: Route.MetaArgs) {
  return [{ title: loaderData?.coupon?.code ?? metaT(matches)("coupons.newTitle") }];
}

const isNew = (couponId: string) => couponId === "new";

export async function loader({ params, context }: Route.LoaderArgs) {
  const tenant = context.get(tenantContext);
  if (tenant.role !== "owner") throw data("Only owners manage coupons", { status: 404 });
  const coupon = isNew(params.couponId) ? null : await getCoupon(tenant, params.couponId);
  if (!isNew(params.couponId) && !coupon) throw data("Coupon not found", { status: 404 });
  const [categories, settings, products] = await Promise.all([
    listCategories(tenant),
    catalogSettings(tenant),
    coupon?.productIds.length ? searchProducts(tenant, "", coupon.productIds) : [],
  ]);
  return {
    coupon,
    categories,
    products,
    currency: settings.currency,
    timeZone: settings.timeZone,
    i18n: translations(context, "coupons", "forms"),
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const tenant = context.get(tenantContext);
  if (tenant.role !== "owner") throw data("Only owners manage coupons", { status: 403 });
  const formData = await request.formData();
  if (formData.get("intent") === "delete" && !isNew(params.couponId)) {
    await deleteCoupon(tenant, params.couponId);
    throw redirect(href("/app/:workspace/coupons", { workspace: params.workspace }));
  }
  const submission = parseWithZod(formData, { schema: couponFormSchema });
  if (submission.status !== "success")
    return data({ result: submission.reply(), saved: false }, { status: 400 });
  try {
    await saveCoupon(
      tenant,
      isNew(params.couponId) ? null : params.couponId,
      couponInputOf(submission.value),
    );
  } catch (error) {
    if (error instanceof NotFoundError) throw data("Coupon not found", { status: 404 });
    if (error instanceof DomainError && error.code === "code_taken") {
      return data(
        {
          result: submission.reply({ fieldErrors: { code: ["forms.couponCodeTaken"] } }),
          saved: false,
        },
        { status: 400 },
      );
    }
    throw error;
  }
  throw redirect(
    `${href("/app/:workspace/coupons", { workspace: params.workspace })}?saved=${submission.value.code}`,
  );
}

/** A code that's easy to say out loud: no 0/O or 1/I. */
function randomCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => letters[byte % letters.length]).join("");
}

export default function CouponEditor({ loaderData, actionData, params }: Route.ComponentProps) {
  const t = useT();
  const { coupon, categories, currency, timeZone } = loaderData;
  const [search] = useSearchParams();
  const [form, fields] = useForm({
    id: `coupon-${params.couponId}`,
    lastResult: actionData?.result,
    defaultValue: {
      code: coupon?.code ?? search.get("code") ?? "",
      note: coupon?.note ?? "",
      kind: coupon?.kind ?? "percent",
      amount: coupon
        ? coupon.kind === "percent"
          ? String(coupon.amount)
          : minorToPrice(coupon.amount)
        : "10",
      startsOn: coupon?.startsAt ? dayOf(new Date(coupon.startsAt), timeZone) : "",
      endsOn: coupon?.endsAt ? dayOf(new Date(coupon.endsAt), timeZone, { endOfDay: true }) : "",
      usageLimit: coupon?.usageLimit == null ? "" : String(coupon.usageLimit),
      usageLimitPerCustomer:
        coupon?.usageLimitPerCustomer == null ? "" : String(coupon.usageLimitPerCustomer),
      minSubtotal: coupon?.minSubtotal == null ? "" : minorToPrice(coupon.minSubtotal),
      appliesTo:
        coupon && coupon.productIds.length + coupon.categoryIds.length > 0 ? "some" : "all",
      categoryIds: coupon?.categoryIds ?? [],
      excludeSaleItems: coupon?.excludeSaleItems ? "on" : "",
      active: coupon ? (coupon.active ? "on" : "") : "on",
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: couponFormSchema }),
  });
  const percent = fields.kind.value !== "fixed";
  const some = fields.appliesTo.value === "some";
  const [code, setCode] = useState(String(fields.code.initialValue ?? ""));

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <div>
        <Link
          to={href("/app/:workspace/coupons", { workspace: params.workspace })}
          className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          {t("coupons.back")}
        </Link>
        <PageHeader
          title={coupon ? coupon.code : t("coupons.newTitle")}
          description={t("coupons.editorIntro")}
        />
      </div>

      <Form method="post" {...getFormProps(form)} className="grid gap-6">
        <input type="hidden" name="timeZone" value={timeZone} />
        <Section title={t("coupons.codeHeading")}>
          <div className="grid gap-2">
            <Label htmlFor={fields.code.id}>{t("coupons.codeLabel")}</Label>
            <div className="flex gap-2">
              <Input
                {...getInputProps(fields.code, {
                  type: "text",
                  ariaDescribedBy: `${fields.code.id}-hint`,
                })}
                key={fields.code.key}
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                autoCapitalize="characters"
                autoComplete="off"
                className="font-mono uppercase"
              />
              <Button type="button" variant="outline" onClick={() => setCode(randomCode())}>
                <ShuffleIcon aria-hidden className="size-4" />
                {t("coupons.generate")}
              </Button>
            </div>
            <p id={`${fields.code.id}-hint`} className="text-sm text-muted-foreground">
              {t("coupons.codeHint")}
            </p>
            <FieldErrors id={fields.code.errorId} errors={fields.code.errors} />
          </div>
          <TextField
            field={fields.note}
            label={t("coupons.noteLabel")}
            description={t("coupons.noteHint")}
          />
        </Section>

        <Section title={t("coupons.discountHeading")}>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">{t("coupons.kindLabel")}</legend>
            <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
              {(["percent", "fixed"] as const).map((kind) => (
                <label
                  key={kind}
                  className={cn(
                    "grid min-h-11 cursor-pointer place-items-center rounded-sm text-sm font-medium has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                    (fields.kind.value ?? "percent") === kind
                      ? "bg-background shadow-xs"
                      : "text-muted-foreground",
                  )}
                >
                  <input
                    type="radio"
                    name={fields.kind.name}
                    value={kind}
                    defaultChecked={fields.kind.initialValue === kind}
                    className="sr-only"
                  />
                  {t(`coupons.kind_${kind}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <TextField
            field={fields.amount}
            label={percent ? t("coupons.percentLabel") : t("coupons.amountLabel", { currency })}
            inputMode={percent ? "numeric" : "decimal"}
            description={percent ? t("coupons.percentHint") : t("coupons.amountHint")}
            className="max-w-64"
          />
          <TextField
            field={fields.minSubtotal}
            label={t("coupons.minSubtotalLabel", { currency })}
            inputMode="decimal"
            description={t("coupons.minSubtotalHint")}
            className="max-w-64"
          />
        </Section>

        <Section title={t("coupons.scopeHeading")}>
          <fieldset className="grid gap-1">
            <legend className="sr-only">{t("coupons.scopeHeading")}</legend>
            {(["all", "some"] as const).map((value) => (
              <label key={value} className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="radio"
                  name={fields.appliesTo.name}
                  value={value}
                  defaultChecked={fields.appliesTo.initialValue === value}
                  className="size-5 accent-primary"
                />
                {t(`coupons.appliesTo_${value}`)}
              </label>
            ))}
          </fieldset>
          <div className={cn("grid gap-4", !some && "hidden")}>
            <ProductPicker
              workspace={params.workspace}
              name={fields.productIds.name}
              initial={loaderData.products}
            />
            {categories.length > 0 ? (
              <fieldset className="grid gap-1">
                <legend className="mb-1 text-sm font-medium">
                  {t("coupons.collectionsLabel")}
                </legend>
                {categories.map((category) => (
                  <label
                    key={category.id}
                    className={cn(
                      "flex min-h-11 items-center gap-3 text-sm",
                      category.parentId && "pl-6",
                    )}
                  >
                    <input
                      type="checkbox"
                      name={fields.categoryIds.name}
                      value={category.id}
                      defaultChecked={(
                        fields.categoryIds.initialValue as string[] | undefined
                      )?.includes(category.id)}
                      className="size-5 accent-primary"
                    />
                    {category.name}
                  </label>
                ))}
              </fieldset>
            ) : null}
            <FieldErrors id={fields.productIds.errorId} errors={fields.productIds.errors} />
          </div>
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input
              {...getInputProps(fields.excludeSaleItems, { type: "checkbox" })}
              key={fields.excludeSaleItems.key}
              className="mt-0.5 size-5 shrink-0 accent-primary"
            />
            <span className="grid gap-0.5">
              <span className="font-medium">{t("coupons.excludeSale")}</span>
              <span className="text-muted-foreground">{t("coupons.excludeSaleHint")}</span>
            </span>
          </label>
        </Section>

        <Section title={t("coupons.whenHeading")}>
          <div className="grid grid-cols-2 gap-4">
            <TextField field={fields.startsOn} type="date" label={t("coupons.startsOn")} />
            <TextField field={fields.endsOn} type="date" label={t("coupons.endsOn")} />
          </div>
          <p className="-mt-2 text-sm text-muted-foreground">{t("coupons.datesHint")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              field={fields.usageLimit}
              label={t("coupons.usageLimit")}
              inputMode="numeric"
              description={t("coupons.usageLimitHint")}
            />
            <TextField
              field={fields.usageLimitPerCustomer}
              label={t("coupons.usageLimitPerCustomer")}
              inputMode="numeric"
              description={t("coupons.usageLimitPerCustomerHint")}
            />
          </div>
          {coupon ? (
            <p className="text-sm">{t("coupons.usedSoFar", { count: coupon.usedCount })}</p>
          ) : null}
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input
              {...getInputProps(fields.active, { type: "checkbox" })}
              key={fields.active.key}
              className="mt-0.5 size-5 shrink-0 accent-primary"
            />
            <span className="grid gap-0.5">
              <span className="font-medium">{t("coupons.activeLabel")}</span>
              <span className="text-muted-foreground">{t("coupons.activeHint")}</span>
            </span>
          </label>
        </Section>

        <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-10 -mx-4 border-t bg-background px-4 py-3 md:bottom-0 md:mx-0 md:px-0">
          <Button type="submit" className="w-full sm:w-auto">
            {coupon ? t("coupons.save") : t("coupons.create")}
          </Button>
        </div>
      </Form>

      {coupon ? (
        <Form
          method="post"
          className="border-t pt-6"
          onSubmit={(event) => {
            if (!window.confirm(t("coupons.deleteConfirm", { code: coupon.code })))
              event.preventDefault();
          }}
        >
          <Button type="submit" name="intent" value="delete" variant="destructive">
            <Trash2Icon aria-hidden className="size-4" />
            {t("coupons.delete")}
          </Button>
        </Form>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid gap-4 rounded-lg border p-4">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Products the coupon covers: searched by name or SKU, kept as chips. */
function ProductPicker({
  workspace,
  name,
  initial,
}: {
  workspace: string;
  name: string;
  initial: { id: string; name: string; sku: string | null }[];
}) {
  const t = useT();
  const id = useId();
  const results = useFetcher<typeof searchLoader>();
  const [picked, setPicked] = useState(initial);
  const [query, setQuery] = useState("");
  const find = () =>
    query.trim() &&
    results.load(
      `${href("/app/:workspace/products/search", { workspace })}?q=${encodeURIComponent(query.trim())}`,
    );
  const found = (results.data?.products ?? []).filter((p) => !picked.some((x) => x.id === p.id));

  return (
    <div className="grid gap-2">
      <Label htmlFor={`${id}-q`}>{t("coupons.productsLabel")}</Label>
      {picked.map((product) => (
        <input key={product.id} type="hidden" name={name} value={product.id} />
      ))}
      {picked.length > 0 ? (
        <ul className="flex flex-wrap gap-1">
          {picked.map((product) => (
            <li key={product.id}>
              <span className="inline-flex min-h-9 items-center gap-1 rounded-full border bg-muted pl-3 text-sm">
                {product.name}
                <button
                  type="button"
                  onClick={() => setPicked(picked.filter((p) => p.id !== product.id))}
                  className="grid size-9 place-items-center rounded-full outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  aria-label={t("coupons.removeProduct", { name: product.name })}
                >
                  <XIcon aria-hidden className="size-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Input
          id={`${id}-q`}
          type="search"
          value={query}
          placeholder={t("coupons.productsPlaceholder")}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              find();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={find}
          aria-label={t("coupons.searchProducts")}
        >
          <SearchIcon aria-hidden className="size-4" />
        </Button>
      </div>
      {results.state === "idle" && results.data ? (
        found.length > 0 ? (
          <ul className="grid divide-y rounded-md border" aria-label={t("coupons.results")}>
            {found.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left text-sm hover:bg-accent"
                  onClick={() => setPicked([...picked, product])}
                >
                  <span>{product.name}</span>
                  <span className="text-muted-foreground">{product.sku ?? ""} + </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            {t("coupons.noResults")}
          </p>
        )
      ) : null}
    </div>
  );
}
