import type { AuditLogRow } from "@monaztore/core";
import { href, Link } from "react-router";
import { useLocale, useT } from "~/lib/i18n";

type Row = Omit<AuditLogRow, "createdAt"> & { createdAt: Date | string };

/** Lines of the internal log: what was done, by whom, when, and on which store or account. */
export function AuditList({ rows, showStore = true }: { rows: Row[]; showStore?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  if (rows.length === 0) {
    return (
      <p className="rounded-md border p-6 text-center text-muted-foreground">
        {t("admin.logEmpty")}
      </p>
    );
  }
  return (
    <ul className="grid divide-y rounded-md border">
      {rows.map((row) => (
        <li key={row.id} className="grid gap-1 p-4 text-sm">
          <p className="font-medium">{t(`admin.audit_${row.action}`)}</p>
          <p className="text-muted-foreground">
            <time dateTime={new Date(row.createdAt).toISOString()}>
              {date.format(new Date(row.createdAt))}
            </time>{" "}
            ·{" "}
            {row.actorEmail ? t("admin.logBy", { email: row.actorEmail }) : t("admin.logBySystem")}
          </p>
          {showStore && row.store ? (
            <p>
              <Link
                to={href("/admin/stores/:storeId", { storeId: row.store.id })}
                className="underline underline-offset-4"
              >
                {t("admin.logStore", { name: row.store.name })}
              </Link>
            </p>
          ) : null}
          {row.details?.readOnly === true ? (
            <p className="text-muted-foreground">{t("admin.logReadOnly")}</p>
          ) : null}
          {row.action === "support_change" && typeof row.details?.path === "string" ? (
            <p className="break-all font-mono text-xs text-muted-foreground">
              {String(row.details.method)} {row.details.path}
            </p>
          ) : null}
          {row.targetEmail && row.targetEmail !== row.actorEmail ? (
            <p className="text-muted-foreground">
              {t("admin.logTarget", { email: row.targetEmail })}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
