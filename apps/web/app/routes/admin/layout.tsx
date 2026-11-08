import { Outlet } from "react-router";
import { AdminShell } from "~/components/admin/admin-shell";
import { translations } from "~/lib/locale.server";
import { requireSuperAdmin } from "~/middleware/admin.server";
import type { Route } from "./+types/layout";

// Everything here reads across stores: a super admin who passed the second step this session.
export const middleware: Route.MiddlewareFunction[] = [requireSuperAdmin];

export function loader({ context }: Route.LoaderArgs) {
  return { i18n: translations(context, "admin", "forms") };
}

export function meta() {
  return [{ name: "robots", content: "noindex" }];
}

export default function AdminLayout() {
  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  );
}
