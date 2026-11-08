import { getWorkspace, recentSupportVisits } from "@monaztore/core";
import { PageHeader } from "~/components/page-header";
import { sessionContext, tenantContext } from "~/context";
import { metaT, useLocale, useT } from "~/lib/i18n";
import type { Route } from "./+types/home";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("workspace.homeTitle") }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const { user } = context.get(sessionContext);
  const tenant = context.get(tenantContext);
  const [workspace, supportVisits] = await Promise.all([
    getWorkspace(tenant),
    recentSupportVisits(tenant),
  ]);
  return { name: user.name || user.email, workspace: workspace.name, supportVisits };
}

/** The workspace's first screen: replace it with your project's. */
export default function Home({ loaderData }: Route.ComponentProps) {
  const t = useT();
  const locale = useLocale();
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" });
  return (
    <>
      <PageHeader
        title={t("workspace.homeHeading", { name: loaderData.name })}
        description={t("workspace.homeIntro", { workspace: loaderData.workspace })}
      />
      {loaderData.supportVisits.length > 0 ? (
        <ul aria-live="polite" className="grid gap-2">
          {loaderData.supportVisits.map((visit) => (
            <li
              key={new Date(visit.startedAt).toISOString()}
              className="rounded-md border bg-muted p-4 text-sm"
            >
              {t(visit.readOnly ? "workspace.supportVisitReadOnly" : "workspace.supportVisit", {
                date: date.format(new Date(visit.startedAt)),
              })}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
