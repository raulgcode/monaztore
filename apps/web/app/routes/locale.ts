import { eq, schema } from "@monaztore/db";
import { parseLocale } from "@monaztore/i18n";
import { href, redirect } from "react-router";
import { localeCookieHeader } from "~/lib/locale.server";
import { safeRedirect } from "~/lib/safe-redirect";
import { auth, db } from "~/lib/services.server";
import type { Route } from "./+types/locale";

/**
 * Saves the language: in the `lang` cookie for this device and, when signed in, in the account so
 * other devices and the emails use it too. Works without JS: the form posts here and comes back.
 */
export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const locale = parseLocale(formData.get("locale"));
  const headers = new Headers();
  if (locale) {
    headers.append("Set-Cookie", await localeCookieHeader(locale));
    const session = await auth.api.getSession({ headers: request.headers });
    if (session) {
      await db.update(schema.user).set({ locale }).where(eq(schema.user.id, session.user.id));
    }
  }
  return redirect(safeRedirect(formData.get("redirectTo")), { headers });
}

export function loader() {
  return redirect(href("/"));
}
