import { countNewInquiries, getWorkspace, recentSupportVisits } from "@monaztore/core";
import { InboxIcon } from "lucide-react";
import { href, Link } from "react-router";
import { PageHeader } from "~/components/page-header";
import { sessionContext, tenantContext } from "~/context";
import { metaT, useLocale, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import type { Route } from "./+types/home";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("workspace.homeTitle") }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const { user } = context.get(sessionContext);
  const tenant = context.get(tenantContext);
  const [workspace, supportVisits, newInquiries] = await Promise.all([
    getWorkspace(tenant),
    recentSupportVisits(tenant),
    countNewInquiries(tenant),
  ]);
  return {
    name: user.name || user.email,
    workspace: workspace.name,
    supportVisits,
    newInquiries,
    i18n: translations(context, "inquiries"),
  };
}

/** The workspace's first screen: replace it with your project's. */
export default function Home({ loaderData, params }: Route.ComponentProps) {
  const t = useT();
  const locale = useLocale();
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" });
  return (
    <>
      <PageHeader
        title={t("workspace.homeHeading", { name: loaderData.name })}
        description={t("workspace.homeIntro", { workspace: loaderData.workspace })}
      />
      {loaderData.newInquiries > 0 ? (
        <Link
          to={href("/app/:workspace/inquiries", { workspace: params.workspace })}
          className="mb-4 flex min-h-14 items-center gap-3 rounded-xl border border-primary bg-card p-4 font-medium hover:bg-muted"
        >
          <InboxIcon aria-hidden className="size-5 text-primary" />
          {t("inquiries.homeCard", { count: loaderData.newInquiries })}
        </Link>
      ) : null}
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
