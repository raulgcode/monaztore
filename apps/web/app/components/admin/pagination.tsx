import { Link, useLocation } from "react-router";
import { buttonVariants } from "~/components/ui/button";
import { useT } from "~/lib/i18n";

/** "Previous / Page 2 of 5 / Next", keeping the rest of the URL's state (`?q=`). */
export function AdminPagination({ page, pages }: { page: number; pages: number }) {
  const t = useT();
  const { pathname, search } = useLocation();
  if (pages <= 1) return null;
  const to = (target: number) => {
    const query = new URLSearchParams(search);
    if (target === 1) query.delete("page");
    else query.set("page", String(target));
    return query.size ? `${pathname}?${query}` : pathname;
  };
  return (
    <nav
      aria-label={t("admin.paginationLabel")}
      className="mt-6 flex items-center justify-between gap-2"
    >
      {page > 1 ? (
        <Link to={to(page - 1)} rel="prev" className={buttonVariants({ variant: "outline" })}>
          {t("admin.pagePrevious")}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted-foreground">{t("admin.pageOf", { page, pages })}</span>
      {page < pages ? (
        <Link to={to(page + 1)} rel="next" className={buttonVariants({ variant: "outline" })}>
          {t("admin.pageNext")}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
