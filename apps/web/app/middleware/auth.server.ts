import { resolveTenant } from "@monaztore/core";
import { data, href, type MiddlewareFunction, redirect } from "react-router";
import { sessionContext, tenantContext } from "~/context";
import { applyAccountLocale } from "~/lib/locale.server";
import { auth, db } from "~/lib/services.server";

export const requireSession: MiddlewareFunction<Response> = async ({ request, url, context }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    // `url`, not `request.url`: a client navigation asks for `/app.data`, and the link must not.
    throw redirect(`${href("/login")}?redirectTo=${encodeURIComponent(url.pathname)}`);
  }
  context.set(sessionContext, session);
  await applyAccountLocale(request, context, session.user);
};

/**
 * The workspace comes from the URL (`/app/:workspace/…`), never from the session, so two tabs can
 * work in two workspaces. Not a member, or no such workspace: 404, without telling them apart.
 */
export const requireTenant: MiddlewareFunction<Response> = async ({ request, params, context }) => {
  const { session, user } = context.get(sessionContext);
  const tenant = params.workspace ? await resolveTenant(db, user.id, params.workspace) : undefined;
  if (!tenant) throw data("Workspace not found", { status: 404 });

  // The session only remembers the last workspace used, so /app and the next sign-in open it.
  if (session.activeOrganizationId !== tenant.organizationId) {
    await auth.api.setActiveOrganization({
      body: { organizationId: tenant.organizationId },
      headers: request.headers,
    });
  }
  context.set(tenantContext, tenant);
};
