import { endSupportVisit, supportVisitOf } from "@monaztore/core";
import { data, href, redirect } from "react-router";
import { auth, db } from "~/lib/services.server";
import type { Route } from "./+types/stop-support";

/**
 * "Back to admin": ends the support visit, logs it and puts the super admin's own session back.
 * It runs inside the owner's session, so it can't sit under /admin's layout.
 */
export async function action({ request }: Route.ActionArgs) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.session.impersonatedBy) throw data("Not in a support visit", { status: 404 });
  const visit = await supportVisitOf(db, session.session.id);
  // First: stopping deletes the session, which unlinks the visit from it.
  if (visit) await endSupportVisit(db, visit);
  const { headers } = await auth.api.stopImpersonating({
    headers: request.headers,
    returnHeaders: true,
  });
  const to = visit
    ? href("/admin/stores/:storeId", { storeId: visit.organizationId })
    : href("/admin");
  return redirect(to, { headers });
}

export function loader() {
  throw data("Not found", { status: 404 });
}
