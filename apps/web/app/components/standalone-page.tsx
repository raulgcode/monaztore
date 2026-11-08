import { LogOutIcon } from "lucide-react";
import type * as React from "react";
import { Form, href, Link } from "react-router";
import { Logo } from "~/components/logo";
import { ThemeToggle } from "~/components/theme-toggle";
import { Button } from "~/components/ui/button";
import { useT } from "~/lib/i18n";

/**
 * A narrow page outside a workspace: sign-in, sign-up, onboarding. `signOut` shows "Sign out"
 * in the header, the only way out for someone without the workspace's menu.
 */
export function StandalonePage({
  children,
  signOut = false,
}: {
  children: React.ReactNode;
  signOut?: boolean;
}) {
  const t = useT();

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-4">
      <header className="flex items-center justify-between">
        <Link
          to={href("/")}
          className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Logo name={t("common.appName")} />
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          {signOut ? (
            <Form method="post" action={href("/logout")}>
              <Button type="submit" variant="ghost">
                <LogOutIcon aria-hidden className="size-5" />
                {t("common.signOut")}
              </Button>
            </Form>
          ) : null}
        </div>
      </header>
      <main className="flex flex-1 flex-col justify-center py-8">{children}</main>
    </div>
  );
}
