import type { StoreThemeId } from "@monaztore/contracts/store-theme-ids";
import { resolveStoreTheme } from "@monaztore/core/themes";
import type * as React from "react";
import { useT } from "~/lib/i18n";
import { cn } from "~/lib/utils";

/**
 * A small drawing of the storefront's front page with a theme and a brand: the same colors and
 * layout `resolveStoreTheme` gives the real store, worked out in the browser as the owner types.
 * Decorative: what it shows is already in the form's fields.
 */
export function ThemePreview({
  theme,
  palette,
  scheme,
  brandColor,
  name,
  logoUrl,
  heroImageUrl,
  title,
  announcement,
  compact = false,
}: {
  theme: StoreThemeId;
  palette?: string;
  /** Light or dark, whatever the workspace itself is in; unset follows it. */
  scheme?: "light" | "dark";
  brandColor?: string;
  name: string;
  logoUrl?: string | null;
  heroImageUrl?: string | null;
  title?: string;
  announcement?: string;
  compact?: boolean;
}) {
  const t = useT();
  const resolved = resolveStoreTheme({ theme, palette, brandColor });
  const { layout } = resolved;
  const heading = title || name;
  const products = compact ? 3 : layout.productCard === "row" ? 4 : 4;
  return (
    <div
      aria-hidden
      style={{ ...(resolved.style as React.CSSProperties), colorScheme: scheme }}
      className={cn(
        "overflow-hidden rounded-lg border bg-background text-foreground",
        compact ? "text-[0.55rem]" : "text-xs",
      )}
    >
      {announcement && !compact ? (
        <p className="bg-primary px-2 py-1 text-center text-primary-foreground">{announcement}</p>
      ) : null}
      <div className="flex items-center justify-between border-b px-2 py-1.5">
        {logoUrl && !compact ? (
          <img src={logoUrl} alt="" className="h-5 w-auto max-w-20 object-contain" />
        ) : (
          <span className="truncate font-heading font-semibold">{name}</span>
        )}
        <span className="size-3 rounded-full bg-primary" />
      </div>
      <div className="grid gap-2 p-2">
        {layout.hero === "spotlight" ? (
          <div
            className={cn(
              "relative grid overflow-hidden rounded-[var(--radius)] bg-primary text-primary-foreground",
              compact ? "h-14" : "h-28",
            )}
          >
            {heroImageUrl && !compact ? (
              <>
                <img
                  src={heroImageUrl}
                  alt=""
                  className="absolute inset-0 size-full object-cover"
                />
                <span className="absolute inset-0 bg-gradient-to-t from-scrim/85 to-transparent" />
              </>
            ) : null}
            <span
              className={cn(
                "relative self-end p-2 font-heading",
                compact ? "text-xs" : "text-base",
                heroImageUrl && !compact && "text-on-scrim",
              )}
            >
              {heading}
            </span>
          </div>
        ) : (
          <div
            className={cn(
              "flex items-center gap-2 rounded-[var(--radius)] bg-accent p-2 text-accent-foreground",
              layout.hero === "compact" ? (compact ? "h-9" : "h-16") : compact ? "h-14" : "h-24",
            )}
          >
            <div className="grid flex-1 gap-1">
              <span className={cn("font-heading font-semibold", compact ? "text-xs" : "text-sm")}>
                {heading}
              </span>
              <span className="h-2.5 w-10 rounded-sm bg-primary" />
            </div>
            {heroImageUrl && !compact ? (
              <img src={heroImageUrl} alt="" className="h-full w-1/3 rounded-sm object-cover" />
            ) : null}
          </div>
        )}
        {layout.productCard === "row" ? (
          <div className="grid divide-y rounded-[var(--radius)] border">
            {Array.from({ length: products }, (_, i) => (
              <div key={i} className="flex items-center gap-2 p-1.5">
                <span className="size-4 shrink-0 rounded-sm bg-muted" />
                <span className="h-1.5 flex-1 rounded-sm bg-muted" />
                <span className="h-1.5 w-6 rounded-sm bg-primary" />
              </div>
            ))}
          </div>
        ) : (
          <div className={cn("grid gap-1.5", compact ? "grid-cols-3" : "grid-cols-4")}>
            {Array.from({ length: products }, (_, i) => (
              <div key={i} className="grid gap-1">
                <span
                  className={cn(
                    "rounded-[calc(var(--radius)-2px)] bg-muted",
                    layout.productCard === "portrait" ? "aspect-[4/5]" : "aspect-square",
                  )}
                />
                {compact ? null : (
                  <>
                    <span className="truncate">{t("design.previewProduct")}</span>
                    <span className="h-1.5 w-2/3 rounded-sm bg-primary" />
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
