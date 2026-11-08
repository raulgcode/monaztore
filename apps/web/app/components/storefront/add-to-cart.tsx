import { getFormProps, getSelectProps, type SubmissionResult, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { addToCartSchema } from "@monaztore/contracts";
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
  const [form, fields] = useForm({
    id: `add-${productId}`,
    lastResult: fetcher.data?.result,
    shouldValidate: "onSubmit",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: addToCartSchema }),
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
      <Button type="submit" size="lg" disabled={!inStock || adding}>
        {adding
          ? t("storefront.adding")
          : inStock
            ? t("storefront.addToCart")
            : t("storefront.soldOut")}
      </Button>
      <div aria-live="polite">
        {fetcher.state === "idle" && fetcher.data?.added ? (
          <p role="status" className="flex flex-wrap items-center gap-2 text-sm">
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
    </fetcher.Form>
  );
}
