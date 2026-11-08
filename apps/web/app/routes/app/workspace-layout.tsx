import { getWorkspace } from "@monaztore/core";
import { Outlet } from "react-router";
import { AppShell } from "~/components/app-shell";
import { tenantContext } from "~/context";
import { translations } from "~/lib/locale.server";
import { requireTenant } from "~/middleware/auth.server";
import type { Route } from "./+types/workspace-layout";

// Everything under /app/:workspace has a verified tenant in `tenantContext`.
export const middleware: Route.MiddlewareFunction[] = [requireTenant];

export async function loader({ context }: Route.LoaderArgs) {
  return {
    workspace: await getWorkspace(context.get(tenantContext)),
    i18n: translations(context, "workspace"),
  };
}

export default function WorkspaceLayout({ loaderData }: Route.ComponentProps) {
  return (
    <AppShell workspace={loaderData.workspace}>
      <Outlet />
    </AppShell>
  );
}
