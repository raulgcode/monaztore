import { PasskeysManager, passkeysShouldRevalidate } from "~/components/passkeys-manager";
import { sessionContext, superAdminContext } from "~/context";
import { metaT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { passkeysAction, passkeysLoader } from "~/lib/passkeys-page.server";
import type { Route } from "./+types/security";

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return [{ title: t("admin.titleSuffix", { title: t("security.passkeysTitle") }) }];
}

export const shouldRevalidate = passkeysShouldRevalidate;

function options(context: Route.LoaderArgs["context"]) {
  const { session, user } = context.get(sessionContext);
  return { actor: context.get(superAdminContext), sessionId: session.id, email: user.email };
}

/** The super admin's own passkeys, to pass the second step of /admin without the code. */
export async function loader({ request, context }: Route.LoaderArgs) {
  return {
    ...(await passkeysLoader(request, context, options(context))),
    i18n: translations(context, "security"),
  };
}

export function action({ request, context }: Route.ActionArgs) {
  return passkeysAction(request, options(context));
}

export default function AdminSecurity({ loaderData }: Route.ComponentProps) {
  return <PasskeysManager loaderData={loaderData} />;
}
