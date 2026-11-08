import { getFormProps, getSelectProps, type SubmissionResult, useForm } from "@conform-to/react";
import { href, Link, useFetcher } from "react-router";
import { Button, buttonVariants } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { useLocale, useT } from "~/lib/i18n";
import { formatPrice } from "~/lib/money";

interface Variant {
  id: string;
  options: Record<string, string>;
  price: number | null;
  inStock: boolean;
}

/**
 * Adds the product to the cart without leaving the page. A product with options picks its
 * variant from one list ("M / Red"); sold-out ones show but can't be chosen.
 */
export function AddToCart({
  productId,
  variants,
  optionNames,
  currency,
  inStock,
}: {
  productId: string;
  variants: Variant[];
  optionNames: string[];
  currency: string;
  inStock: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const fetcher = useFetcher<{ added: boolean; result?: SubmissionResult<string[]> }>({
    key: `add-${productId}`,
  });
  const [form, fields] = useForm<{ productId: string; variantId?: string }>({
    id: `add-${productId}`,
    lastResult: fetcher.data?.result,
    // Only the server validates (`addToCartSchema` in the cart's action): the form is hidden ids
    // and a list, nothing a shopper can type wrong, and leaving zod out keeps the product page
    // inside the JavaScript budget.
    shouldValidate: "onSubmit",
  });
  const firstAvailable = variants.find((v) => v.inStock)?.id;
  const adding = fetcher.state !== "idle";

  return (
    <fetcher.Form
      method="post"
      action={href("/cart")}
      className="grid gap-3"
      {...getFormProps(form)}
    >
      <input type="hidden" name="intent" value="add" />
      <input type="hidden" name="productId" value={productId} />
      {variants.length > 0 ? (
        <div className="grid gap-2">
          <Label htmlFor={fields.variantId.id}>
            {optionNames.join(" / ") || t("storefront.chooseVariant")}
          </Label>
          <select
            {...getSelectProps(fields.variantId)}
            key={fields.variantId.key}
            defaultValue={firstAvailable}
            className="h-11 rounded-md border bg-background px-3"
          >
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id} disabled={!variant.inStock}>
                {Object.values(variant.options).join(" / ")}
                {variant.price !== null ? ` · ${formatPrice(variant.price, currency, locale)}` : ""}
                {variant.inStock ? "" : ` · ${t("storefront.soldOut")}`}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {/* The page's main action: on the phone it stays at the bottom, within the thumb's reach,
          with what just happened above it; from 768 px it sits under the options. */}
      <div
        data-sticky-action
        className="fixed inset-x-0 bottom-0 z-30 grid border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgb(0_0_0/0.08)] md:static md:z-auto md:border-0 md:bg-transparent md:p-0 md:shadow-none"
      >
        <div aria-live="polite">
          {fetcher.state === "idle" && fetcher.data?.added ? (
            <p role="status" className="flex flex-wrap items-center gap-x-2 pb-2 text-sm">
              {t("storefront.addedToCart")}
              <Link
                to={href("/cart")}
                className={buttonVariants({ variant: "link", className: "h-auto px-0" })}
              >
                {t("storefront.viewCart")}
              </Link>
            </p>
          ) : null}
        </div>
        <Button type="submit" size="lg" disabled={!inStock || adding}>
          {adding
            ? t("storefront.adding")
            : inStock
              ? t("storefront.addToCart")
              : t("storefront.soldOut")}
        </Button>
      </div>
    </fetcher.Form>
  );
}
