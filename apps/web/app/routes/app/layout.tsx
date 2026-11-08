import { Outlet } from "react-router";
import { requireSession } from "~/middleware/auth.server";
import type { Route } from "./+types/layout";

// Every route under /app has a signed-in user in `sessionContext`.
export const middleware: Route.MiddlewareFunction[] = [requireSession];

export default function SessionLayout() {
  return <Outlet />;
}
