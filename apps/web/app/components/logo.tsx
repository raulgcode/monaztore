import { cn } from "~/lib/utils";

/**
 * The app's mark: a square in the brand color with the initial, and the name beside it. Swap it
 * for the project's logo (an inline SVG keeps it themable with `text-primary`).
 */
export function Logo({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold", className)}>
      <span
        aria-hidden
        className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"
      >
        {name.slice(0, 1)}
      </span>
      <span className="text-lg tracking-tight">{name}</span>
    </span>
  );
}
