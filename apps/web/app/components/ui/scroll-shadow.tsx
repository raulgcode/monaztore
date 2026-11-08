import type * as React from "react";
import { cn } from "~/lib/utils";

/** Marks on the wrapper which edges hide content: `data-start` / `data-end` = "true". */
function updateEdges(scroller: HTMLElement) {
  const wrapper = scroller.parentElement;
  if (!wrapper) return;
  // Right to left pages scroll with negative scrollLeft; abs() covers both directions.
  const scrolled = Math.abs(scroller.scrollLeft);
  const max = scroller.scrollWidth - scroller.clientWidth;
  wrapper.dataset.start = String(scrolled > 1);
  wrapper.dataset.end = String(max - scrolled > 1);
}

/**
 * Horizontal scroller with a shadow on each edge that still hides content; the shadow fades
 * when that end is reached. Use it for everything that scrolls sideways (chips, tables, code).
 * The state lives in data attributes set from the scroll and resize events, so scrolling never
 * re-renders React.
 */
export function ScrollShadow({
  className,
  scrollerClassName,
  scrollerLabel,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  scrollerClassName?: string;
  /**
   * For content with nothing focusable inside (code, a long key): names the scroller and makes
   * it focusable, so the keyboard can scroll it too.
   */
  scrollerLabel?: string;
}) {
  return (
    <div
      data-slot="scroll-shadow"
      data-start="false"
      data-end="false"
      className={cn("group/scroll relative min-w-0", className)}
      {...props}
    >
      <div
        ref={(scroller) => {
          if (!scroller) return;
          updateEdges(scroller);
          // In a grid or flex item, give the parent min-w-0 too, or it grows to fit the content.
          // Content or viewport size changes (new counts, rotating the phone) move the edges.
          const observer = new ResizeObserver(() => updateEdges(scroller));
          observer.observe(scroller);
          for (const child of scroller.children) observer.observe(child);
          return () => observer.disconnect();
        }}
        onScroll={(event) => updateEdges(event.currentTarget)}
        className={cn(
          scrollerLabel &&
            "rounded-[inherit] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          scrollerClassName,
        )}
        {...(scrollerLabel
          ? { role: "region", "aria-label": scrollerLabel, tabIndex: 0 }
          : undefined)}
        // Inline, not a class: scrolling is this component's job, whatever classes it gets.
        style={{ overflowX: "auto" }}
      >
        {children}
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-linear-to-r from-scroll-shadow to-transparent opacity-0 transition-opacity group-data-[start=true]/scroll:opacity-100"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-scroll-shadow to-transparent opacity-0 transition-opacity group-data-[end=true]/scroll:opacity-100"
      />
    </div>
  );
}
