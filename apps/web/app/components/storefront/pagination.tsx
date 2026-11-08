import { Link, useLocation } from "react-router";
import { buttonVariants } from "~/components/ui/button";
import { useT } from "~/lib/i18n";

/** Previous / next, keeping the rest of the URL (`?q=`). Hidden with a single page. */
export function Pagination({ page, pages }: { page: number; pages: number }) {
  const t = useT();
  const { pathname, search } = useLocation();
  if (pages <= 1) return null;
  const to = (target: number) => {
    const params = new URLSearchParams(search);
    if (target === 1) params.delete("page");
    else params.set("page", String(target));
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };
  return (
    <nav
      aria-label={t("storefront.pagination")}
      className="mt-8 flex items-center justify-between gap-2"
    >
      {page > 1 ? (
        <Link to={to(page - 1)} rel="prev" className={buttonVariants({ variant: "outline" })}>
          {t("storefront.previous")}
        </Link>
      ) : (
        <span />
      )}
      <p className="text-sm text-muted-foreground">
        {t("storefront.pageOf", { page: String(page), pages: String(pages) })}
      </p>
      {page < pages ? (
        <Link to={to(page + 1)} rel="next" className={buttonVariants({ variant: "outline" })}>
          {t("storefront.next")}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
