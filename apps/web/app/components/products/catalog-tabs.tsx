import { href, NavLink } from "react-router";
import { ScrollShadow } from "~/components/ui/scroll-shadow";
import { useT } from "~/lib/i18n";
import { cn } from "~/lib/utils";

/** Products, their collections and the coupons: three screens of one section. */
export function CatalogTabs({ workspace }: { workspace: string }) {
  const t = useT();
  const tabs = [
    { to: href("/app/:workspace/products", { workspace }), label: t("products.tabProducts") },
    { to: href("/app/:workspace/collections", { workspace }), label: t("products.tabCollections") },
    { to: href("/app/:workspace/coupons", { workspace }), label: t("products.tabCoupons") },
  ];
  return (
    <nav aria-label={t("products.tabsLabel")} className="mb-4">
      <ScrollShadow scrollerClassName="flex gap-1 border-b">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end
            className={({ isActive }) =>
              cn(
                "-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </ScrollShadow>
    </nav>
  );
}
