import { listMemberships } from "@monaztore/core";
import { href, redirect } from "react-router";
import { sessionContext } from "~/context";
import { db } from "~/lib/services.server";
import type { Route } from "./+types/open-workspace";

// /app has no page of its own: it opens the workspace used last, the first one, or onboarding.
export async function loader({ context }: Route.LoaderArgs) {
  const { session, user } = context.get(sessionContext);
  const memberships = await listMemberships(db, user.id);
  const workspace =
    memberships.find((m) => m.organizationId === session.activeOrganizationId) ?? memberships[0];
  if (!workspace) throw redirect(href("/app/onboarding"));
  throw redirect(href("/app/:workspace", { workspace: workspace.slug }));
}
