import type { OrderStatus } from "@monaztore/db/schema";
import { useT } from "~/lib/i18n";
import { cn } from "~/lib/utils";

/** An order's state as a small label; the one waiting on the store stands out. */
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const t = useT();
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
        status === "payment_submitted" && "border-primary bg-primary text-primary-foreground",
        status === "cancelled" && "text-muted-foreground",
      )}
    >
      {t(`orders.status_${status}`)}
    </span>
  );
}
