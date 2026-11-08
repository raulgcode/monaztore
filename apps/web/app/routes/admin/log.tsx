import { listAuditLog } from "@monaztore/core";
import { AuditList } from "~/components/admin/audit-list";
import { AdminPagination } from "~/components/admin/pagination";
import { PageHeader } from "~/components/page-header";
import { superAdminContext } from "~/context";
import { metaT, useT } from "~/lib/i18n";
import type { Route } from "./+types/log";

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return [{ title: t("admin.titleSuffix", { title: t("admin.logTitle") }) }];
}

/** The platform's internal log, newest first (`?page=`). Stores never see it. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const page = Number.parseInt(new URL(request.url).searchParams.get("page") ?? "1", 10);
  return listAuditLog(context.get(superAdminContext), {
    page: Number.isFinite(page) && page > 0 ? page : 1,
  });
}

export default function AdminLog({ loaderData }: Route.ComponentProps) {
  const t = useT();
  return (
    <>
      <PageHeader title={t("admin.logTitle")} description={t("admin.logIntro")} />
      <AuditList rows={loaderData.rows} />
      <AdminPagination page={loaderData.page} pages={loaderData.pages} />
    </>
  );
}
