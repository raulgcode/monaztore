import { data } from "react-router";
import { PasskeysManager, passkeysShouldRevalidate } from "~/components/passkeys-manager";
import { sessionContext } from "~/context";
import { metaT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { passkeysAction, passkeysLoader } from "~/lib/passkeys-page.server";
import { db } from "~/lib/services.server";
import type { Route } from "./+types/security";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("security.passkeysTitle") }];
}

export const shouldRevalidate = passkeysShouldRevalidate;

function options(context: Route.LoaderArgs["context"]) {
  const { session, user } = context.get(sessionContext);
  // A passkey is the person's own: support never adds or removes one on their account.
  if (session.impersonatedBy) throw data("Not during support", { status: 404 });
  return { actor: { db, userId: user.id }, sessionId: session.id, email: user.email };
}

/**
 * The person's own fingerprints and keys, in any of their workspaces: they belong to the
 * person, not to the store.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  return {
    ...(await passkeysLoader(request, context, options(context))),
    i18n: translations(context, "security", "forms"),
  };
}

export function action({ request, context }: Route.ActionArgs) {
  return passkeysAction(request, options(context));
}

export default function Security({ loaderData }: Route.ComponentProps) {
  return <PasskeysManager loaderData={loaderData} />;
}
