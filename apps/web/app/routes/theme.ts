import { href, redirect } from "react-router";
import { safeRedirect } from "~/lib/safe-redirect";
import { parseTheme } from "~/lib/theme";
import { themeCookieHeader } from "~/lib/theme.server";
import type { Route } from "./+types/theme";

/** Saves the theme (system/light/dark) in a cookie. Works without JS: the form posts here and comes back. */
export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const headers = new Headers();
  headers.append("Set-Cookie", await themeCookieHeader(parseTheme(formData.get("theme"))));
  return redirect(safeRedirect(formData.get("redirectTo")), { headers });
}

export function loader() {
  return redirect(href("/"));
}
