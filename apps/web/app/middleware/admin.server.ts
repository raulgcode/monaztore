import { ADMIN_MFA_TTL_MS, mfaState, platformAdminContext } from "@monaztore/core";
import { data, href, type MiddlewareFunction, redirect } from "react-router";
import { sessionContext, superAdminContext } from "~/context";
import { applyAccountLocale } from "~/lib/locale.server";
import { safeRedirect } from "~/lib/safe-redirect";
import { auth, db } from "~/lib/services.server";

/**
 * Who is a super admin, before the second step: signed out goes to sign in; signed in as
 * anyone else, or while inside a store's account for support, a 404, as if /admin did not
 * exist. /admin/mfa runs only this; the rest of /admin runs `requireSuperAdmin`.
 */
export const requireSuperAdminIdentity: MiddlewareFunction<Response> = async ({
  request,
  url,
  context,
}) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    throw redirect(`${href("/login")}?redirectTo=${encodeURIComponent(url.pathname)}`);
  }
  const admin = session.session.impersonatedBy
    ? undefined
    : await platformAdminContext(db, session.user.id);
  if (!admin) throw data("Page not found", { status: 404 });
  context.set(sessionContext, session);
  context.set(superAdminContext, admin);
  await applyAccountLocale(request, context, session.user);
};

/**
 * /admin sees every store, so the email link or the password isn't enough: the session also
 * needs today's code from the authenticator app (set up on the first visit) or a passkey,
 * every 12 hours.
 */
export const requireSuperAdmin: MiddlewareFunction<Response> = async (args, next) => {
  await requireSuperAdminIdentity(args, next);
  const { context, url } = args;
  const { session } = context.get(sessionContext);
  const state = await mfaState(context.get(superAdminContext), session.id, ADMIN_MFA_TTL_MS);
  if (state === "verified") return;
  const { pathname, search } = url;
  throw redirect(
    `${href("/admin/mfa")}?redirectTo=${encodeURIComponent(safeRedirect(pathname + search))}`,
  );
};
