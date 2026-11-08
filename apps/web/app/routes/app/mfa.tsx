import { TEAM_MFA_TTL_MS } from "@monaztore/core";
import { href, redirect } from "react-router";
import { SecondStep, secondStepShouldRevalidate } from "~/components/second-step";
import { sessionContext } from "~/context";
import { metaT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { secondStepAction, secondStepLoader } from "~/lib/second-step.server";
import { db } from "~/lib/services.server";
import { requireSession } from "~/middleware/auth.server";
import type { Route } from "./+types/mfa";

// Outside /app's layout, which sends here whoever hasn't passed the step in this session.
export const middleware: Route.MiddlewareFunction[] = [requireSession];

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("security.mfaTitle") }, { name: "robots", content: "noindex" }];
}

export const shouldRevalidate = secondStepShouldRevalidate;

/** A store's team: the authenticator app (or a passkey) once per session. */
function options(context: Route.LoaderArgs["context"]) {
  const { session, user } = context.get(sessionContext);
  // Support already passed /admin's step; it never sets one up on the owner's account.
  if (session.impersonatedBy) throw redirect(href("/app"));
  return {
    actor: { db, userId: user.id },
    sessionId: session.id,
    email: user.email,
    ttlMs: TEAM_MFA_TTL_MS,
    fallback: href("/app"),
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

export default function TeamMfa({ loaderData, actionData }: Route.ComponentProps) {
  return <SecondStep loaderData={loaderData} actionData={actionData} />;
}
