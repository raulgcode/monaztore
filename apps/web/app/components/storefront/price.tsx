import { useLocale, useT } from "~/lib/i18n";
import { formatPrice } from "~/lib/money";
import { cn } from "~/lib/utils";

/** A price, with the regular one crossed out when it is on sale. */
export function Price({
  price,
  compareAtPrice,
  currency,
  from = false,
  className,
}: {
  price: number | null;
  compareAtPrice: number | null;
  currency: string;
  /** Variants with different prices: "From ₡10 000". */
  from?: boolean;
  className?: string;
}) {
  const t = useT();
  const locale = useLocale();
  if (price === null) {
    return (
      <p className={cn("text-muted-foreground", className)}>{t("storefront.priceUnavailable")}</p>
    );
  }
  const amount = formatPrice(price, currency, locale);
  const onSale = compareAtPrice !== null && compareAtPrice > price;
  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-2", className)}>
      <span className="font-semibold">
        {from ? t("storefront.fromPrice", { price: amount }) : amount}
      </span>
      {onSale ? (
        <s className="text-sm text-muted-foreground">
          <span className="sr-only">{`${t("storefront.regularPrice")} `}</span>
          {formatPrice(compareAtPrice, currency, locale)}
        </s>
      ) : null}
    </p>
  );
}
