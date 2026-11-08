import { HomeIcon, type LucideIcon, SettingsIcon } from "lucide-react";
import type * as React from "react";
import { href, NavLink } from "react-router";
import { Logo } from "~/components/logo";
import { ThemeToggle } from "~/components/theme-toggle";
import { useT } from "~/lib/i18n";
import { cn } from "~/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

/**
 * The layout of a workspace. On the phone the sections are a bar at the bottom, in reach of the
 * thumb; from 768 px they move to a side menu. A new section is one more item in `items`.
 */
export function AppShell({
  workspace,
  children,
}: {
  workspace: { name: string; slug: string };
  children: React.ReactNode;
}) {
  const t = useT();
  const items: NavItem[] = [
    {
      to: href("/app/:workspace", { workspace: workspace.slug }),
      label: t("workspace.navHome"),
      icon: HomeIcon,
      end: true,
    },
    {
      to: href("/app/:workspace/settings", { workspace: workspace.slug }),
      label: t("workspace.navSettings"),
      icon: SettingsIcon,
    },
  ];

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
          <Logo name={workspace.name} className="min-w-0 truncate" />
          <ThemeToggle />
        </div>
        <Nav items={items} label={t("workspace.navLabel")} variant="side" />
      </aside>
      <div className="flex min-w-0 flex-col pb-20 md:pb-0">
        <header className="flex items-center justify-between border-b px-4 py-2 md:hidden">
          <Logo name={workspace.name} className="min-w-0 truncate" />
          <ThemeToggle />
        </header>
        <main id="content" className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 md:px-8">
          {children}
        </main>
      </div>
      <div className="fixed inset-x-0 bottom-0 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        <Nav items={items} label={t("workspace.navLabel")} variant="bottom" />
      </div>
    </div>
  );
}

function Nav({
  items,
  label,
  variant,
}: {
  items: NavItem[];
  label: string;
  variant: "side" | "bottom";
}) {
  return (
    <nav aria-label={label}>
      <ul className={variant === "bottom" ? "grid grid-flow-col auto-cols-fr" : "grid gap-1"}>
        {items.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  variant === "bottom" && "flex-col justify-center gap-1 rounded-none py-2 text-xs",
                  isActive
                    ? "bg-nav-active text-nav-active-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              <Icon aria-hidden className="size-5" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
