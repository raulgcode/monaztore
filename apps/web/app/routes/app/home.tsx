import { getWorkspace } from "@monaztore/core";
import { PageHeader } from "~/components/page-header";
import { sessionContext, tenantContext } from "~/context";
import { metaT, useT } from "~/lib/i18n";
import type { Route } from "./+types/home";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("workspace.homeTitle") }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const { user } = context.get(sessionContext);
  const workspace = await getWorkspace(context.get(tenantContext));
  return { name: user.name || user.email, workspace: workspace.name };
}

/** The workspace's first screen: replace it with your project's. */
export default function Home({ loaderData }: Route.ComponentProps) {
  const t = useT();
  return (
    <PageHeader
      title={t("workspace.homeHeading", { name: loaderData.name })}
      description={t("workspace.homeIntro", { workspace: loaderData.workspace })}
    />
  );
}
