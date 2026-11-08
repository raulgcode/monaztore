import { auth } from "~/lib/services.server";
import type { Route } from "./+types/api.auth";

// Resource route: Better Auth handles /api/auth/* (magic link verification, sign out, ...).
export function loader({ request }: Route.LoaderArgs) {
  return auth.handler(request);
}

export function action({ request }: Route.ActionArgs) {
  return auth.handler(request);
}
