import { href, redirect } from "react-router";
import { auth } from "~/lib/services.server";
import type { Route } from "./+types/logout";

export async function action({ request }: Route.ActionArgs) {
  const { headers } = await auth.api.signOut({ headers: request.headers, returnHeaders: true });
  return redirect(href("/"), { headers });
}
