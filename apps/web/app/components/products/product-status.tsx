import type { ProductStatus } from "@monaztore/contracts";
import { useT } from "~/lib/i18n";
import { cn } from "~/lib/utils";

/** Whether shoppers see the product: published, a draft, or hidden. */
export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  const t = useT();
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
        status !== "active" && "text-muted-foreground",
      )}
    >
      {t(`products.status_${status}`)}
    </span>
  );
}
