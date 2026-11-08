import { href, Link } from "react-router";

/**
 * Floating shortcut to /dev/sign-in. root.tsx renders it behind `import.meta.env.DEV`, so any
 * build drops it along with this module.
 */
export function DevToolsLink() {
  return (
    <Link
      to={href("/dev/sign-in")}
      className="fixed bottom-24 left-3 z-50 rounded-full border bg-background/90 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm hover:text-foreground md:bottom-3"
    >
      Dev · sign in as…
    </Link>
  );
}
