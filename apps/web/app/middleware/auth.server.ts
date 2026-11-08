import {
  mfaState,
  recordSupportChange,
  resolveTenant,
  supportVisitOf,
  TEAM_MFA_TTL_MS,
} from "@monaztore/core";
import { data, href, type MiddlewareFunction, redirect } from "react-router";
import { sessionContext, supportContext, tenantContext } from "~/context";
import { applyAccountLocale } from "~/lib/locale.server";
import { safeRedirect } from "~/lib/safe-redirect";
import { auth, db } from "~/lib/services.server";

const reads = new Set(["GET", "HEAD"]);

export const requireSession: MiddlewareFunction<Response> = async ({ request, url, context }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    // `url`, not `request.url`: a client navigation asks for `/app.data`, and the link must not.
    throw redirect(`${href("/login")}?redirectTo=${encodeURIComponent(url.pathname)}`);
  }
  // A super admin inside this account for support: "only look" refuses every change, and each
  // change otherwise goes to the platform's internal log.
  if (session.session.impersonatedBy) {
    const visit = await supportVisitOf(db, session.session.id);
    if (!visit) throw data("Support session not found", { status: 403 });
    if (!reads.has(request.method)) {
      if (visit.readOnly) throw data("Support is only looking", { status: 403 });
      await recordSupportChange(db, visit, { method: request.method, path: url.pathname });
    }
    context.set(supportContext, visit);
  }
  context.set(sessionContext, session);
  await applyAccountLocale(request, context, session.user);
};

/**
 * Every store's team passes the second step (authenticator app or passkey) once per session,
 * before anything under /app. A support session already passed /admin's.
 */
export const requireSecondStep: MiddlewareFunction<Response> = async ({ url, context }) => {
  const { session, user } = context.get(sessionContext);
  if (session.impersonatedBy) return;
  const state = await mfaState({ db, userId: user.id }, session.id, TEAM_MFA_TTL_MS);
  if (state === "verified") return;
  throw redirect(
    `${href("/app/mfa")}?redirectTo=${encodeURIComponent(safeRedirect(url.pathname + url.search))}`,
  );
};

/**
 * The workspace comes from the URL (`/app/:workspace/…`), never from the session, so two tabs can
 * work in two workspaces. Not a member, or no such workspace: 404, without telling them apart.
 */
export const requireTenant: MiddlewareFunction<Response> = async ({ request, params, context }) => {
  const { session, user } = context.get(sessionContext);
  const tenant = params.workspace ? await resolveTenant(db, user.id, params.workspace) : undefined;
  if (!tenant) throw data("Workspace not found", { status: 404 });
  // Support only enters the store it opened from /admin.
  const visit = context.get(supportContext);
  if (visit && visit.organizationId !== tenant.organizationId) {
    throw data("Workspace not found", { status: 404 });
  }

  // The session only remembers the last workspace used, so /app and the next sign-in open it.
  if (session.activeOrganizationId !== tenant.organizationId) {
    await auth.api.setActiveOrganization({
      body: { organizationId: tenant.organizationId },
      headers: request.headers,
    });
  }
  context.set(tenantContext, tenant);
};
