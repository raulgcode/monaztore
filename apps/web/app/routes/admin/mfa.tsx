import { ADMIN_MFA_TTL_MS } from "@monaztore/core";
import { href } from "react-router";
import { SecondStep, secondStepShouldRevalidate } from "~/components/second-step";
import { sessionContext, superAdminContext } from "~/context";
import { metaT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { secondStepAction, secondStepLoader } from "~/lib/second-step.server";
import { requireSuperAdminIdentity } from "~/middleware/admin.server";
import type { Route } from "./+types/mfa";

export const middleware: Route.MiddlewareFunction[] = [requireSuperAdminIdentity];

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("security.mfaTitle") }, { name: "robots", content: "noindex" }];
}

export const shouldRevalidate = secondStepShouldRevalidate;

/** The second step of /admin: every new session, and again after 12 hours. */
function options(context: Route.LoaderArgs["context"]) {
  const { session, user } = context.get(sessionContext);
  return {
    actor: context.get(superAdminContext),
    sessionId: session.id,
    email: user.email,
    ttlMs: ADMIN_MFA_TTL_MS,
    fallback: href("/admin"),
  };
}

export async function loader({ request, context }: Route.LoaderArgs) {
  return {
    ...(await secondStepLoader(request, options(context))),
    i18n: translations(context, "security", "forms"),
  };
}

export function action({ request, context }: Route.ActionArgs) {
  return secondStepAction(request, options(context));
}

export default function AdminMfa({ loaderData, actionData }: Route.ComponentProps) {
  return <SecondStep loaderData={loaderData} actionData={actionData} />;
}
