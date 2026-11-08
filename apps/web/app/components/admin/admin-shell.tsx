import { FingerprintIcon, PercentIcon, ScrollTextIcon, StoreIcon } from "lucide-react";
import type * as React from "react";
import { href } from "react-router";
import { Nav, type NavItem } from "~/components/app-shell";
import { Logo } from "~/components/logo";
import { ThemeToggle } from "~/components/theme-toggle";
import { useT } from "~/lib/i18n";

/**
 * The layout of /admin, the same shape as a workspace's: a bar at the bottom on the phone, a
 * side menu from 768 px. A new section is one more item.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const t = useT();
  const items: NavItem[] = [
    { to: href("/admin"), label: t("admin.navStores"), icon: StoreIcon, end: true },
    { to: href("/admin/commission"), label: t("admin.navCommission"), icon: PercentIcon },
    { to: href("/admin/log"), label: t("admin.navLog"), icon: ScrollTextIcon },
    { to: href("/admin/security"), label: t("admin.navSecurity"), icon: FingerprintIcon },
  ];
  const name = `${t("common.appName")} ${t("admin.panelName")}`;

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[16rem_1fr]">
      <a
        href="#content"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t("common.skipToContent")}
      </a>
      <aside className="hidden border-r bg-sidebar md:flex md:flex-col md:gap-6 md:p-4">
        <div className="flex items-center justify-between gap-2">
          <Logo name={name} className="min-w-0 truncate" />
          <ThemeToggle />
        </div>
        <Nav items={items} label={t("admin.navLabel")} variant="side" />
      </aside>
      <div className="flex min-w-0 flex-col pb-20 md:pb-0">
        <header className="flex items-center justify-between border-b px-4 py-2 md:hidden">
          <Logo name={name} className="min-w-0 truncate" />
          <ThemeToggle />
        </header>
        <main id="content" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-8">
          {children}
        </main>
      </div>
      <div className="fixed inset-x-0 bottom-0 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        <Nav items={items} label={t("admin.navLabel")} variant="bottom" />
      </div>
    </div>
  );
}
