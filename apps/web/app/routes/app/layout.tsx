import { Form, href, Outlet } from "react-router";
import { Button } from "~/components/ui/button";
import { sessionContext, supportContext } from "~/context";
import { richText, useT } from "~/lib/i18n";
import { requireSecondStep, requireSession } from "~/middleware/auth.server";
import type { Route } from "./+types/layout";

// Every route under /app has a signed-in user in `sessionContext`, past the second step.
export const middleware: Route.MiddlewareFunction[] = [requireSession, requireSecondStep];

/** Only a super admin inside the account (support) gets anything here: the banner. */
export function loader({ context }: Route.LoaderArgs) {
  const visit = context.get(supportContext);
  if (!visit) return { support: null };
  const { user } = context.get(sessionContext);
  return { support: { email: user.email, readOnly: visit.readOnly } };
}

export default function SessionLayout({ loaderData }: Route.ComponentProps) {
  return (
    <>
      {loaderData.support ? <SupportBanner {...loaderData.support} /> : null}
      <Outlet />
    </>
  );
}

/** Fixed on top while support is inside a store, with the way back to /admin. */
function SupportBanner({ email, readOnly }: { email: string; readOnly: boolean }) {
  const t = useT();
  return (
    <section
      aria-label={t("common.supportLeave")}
      className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 bg-primary px-4 py-2 text-sm text-primary-foreground"
    >
      <p className="min-w-0 break-words">
        {richText(
          t,
          readOnly ? "common.supportBannerReadOnly" : "common.supportBanner",
          { strong: (text) => <strong>{text}</strong> },
          { email },
        )}
      </p>
      {/* A whole document: the cookies change back to the admin's own session. */}
      <Form method="post" action={href("/admin/support/stop")} reloadDocument>
        <Button type="submit" variant="secondary" className="min-h-11">
          {t("common.supportLeave")}
        </Button>
      </Form>
    </section>
  );
}
