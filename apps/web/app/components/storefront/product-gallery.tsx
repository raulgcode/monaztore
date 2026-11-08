import { ChevronLeftIcon, ChevronRightIcon, ImageIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ScrollShadow } from "~/components/ui/scroll-shadow";
import { useT } from "~/lib/i18n";
import { photoSrc, photoSrcSet } from "~/lib/media";
import { cn } from "~/lib/utils";

/** Half the page from 768 px, the whole width on a phone. */
const mainSizes = "(min-width: 1152px) 560px, (min-width: 768px) 50vw, 100vw";

/**
 * A product's photos like a big shop shows them: one large photo at a time that swipes on a
 * phone, arrows to go back and forth, and the thumbnails beside it (under it on a phone) to jump
 * to any. It's a carousel in the WAI-ARIA sense: each photo is a slide named "Photo 2 of 5",
 * the arrows and thumbnails are buttons, and the photo on screen is announced. Only the first
 * photo loads with the page (it is the largest paint); the rest load as they come near, at the
 * width the screen needs.
 */
export function ProductGallery({
  images,
  name,
}: {
  images: { url: string; alt: string }[];
  name: string;
}) {
  const t = useT();
  const track = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  const total = images.length;

  // A browser effect: follow the swipe, so the counter and the thumbnails show where it is.
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const width = element.clientWidth || 1;
        setActive(Math.min(total - 1, Math.max(0, Math.round(element.scrollLeft / width))));
      });
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener("scroll", onScroll);
    };
  }, [total]);

  if (total === 0) {
    return (
      <div className="relative aspect-square rounded-[var(--radius)] bg-muted">
        <ImageIcon aria-hidden className="absolute inset-0 m-auto size-10 text-muted-foreground" />
      </div>
    );
  }

  const go = (index: number) => {
    const element = track.current;
    const next = Math.min(total - 1, Math.max(0, index));
    setActive(next);
    if (!element) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollTo({ left: next * element.clientWidth, behavior: reduce ? "auto" : "smooth" });
  };
  const label = (index: number) =>
    t("storefront.photoOf", { index: String(index + 1), total: String(total) });

  return (
    <section
      aria-roledescription={t("storefront.carousel")}
      aria-label={t("storefront.photos", { name })}
      className="grid min-w-0 gap-3 md:grid-cols-[4.5rem_minmax(0,1fr)] md:gap-4"
    >
      <div className="relative min-w-0 self-start md:col-start-2">
        {/* The carousel's own track: it scrolls one photo at a time, with arrows, a counter and
            thumbnails as its controls, so it needs no scroll shadow and hides its scrollbar. */}
        {/* Focusable, so a keyboard can scroll it too: the arrow keys go photo by photo. */}
        <ul
          ref={track}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region must take the keyboard (axe scrollable-region-focusable)
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
              event.preventDefault();
              go(active + (event.key === "ArrowRight" ? 1 : -1));
            }
          }}
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-[var(--radius)] bg-muted outline-none [scrollbar-width:none] focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-scrollbar]:hidden"
        >
          {images.map((image, index) => (
            <li
              key={image.url}
              aria-roledescription={t("storefront.slide")}
              aria-label={label(index)}
              aria-hidden={index === active ? undefined : true}
              className="w-full shrink-0 snap-start snap-always"
            >
              <img
                src={photoSrc(image.url, 960)}
                srcSet={photoSrcSet(image.url, [480, 640, 960])}
                sizes={mainSizes}
                alt={image.alt}
                width={800}
                height={800}
                // The first photo is the page's largest paint: no lazy loading for it.
                loading={index === 0 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : undefined}
                decoding="async"
                className="aspect-square w-full object-cover"
              />
            </li>
          ))}
        </ul>
        {total > 1 ? (
          <>
            <ArrowButton
              side="left"
              label={t("storefront.previousPhoto")}
              disabled={active === 0}
              onClick={() => go(active - 1)}
            />
            <ArrowButton
              side="right"
              label={t("storefront.nextPhoto")}
              disabled={active === total - 1}
              onClick={() => go(active + 1)}
            />
            <p
              aria-hidden
              className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium tabular-nums shadow-sm"
            >
              {`${active + 1} / ${total}`}
            </p>
            <p aria-live="polite" className="sr-only">
              {label(active)}
            </p>
          </>
        ) : null}
      </div>
      {total > 1 ? (
        <ScrollShadow
          className="md:col-start-1 md:row-start-1"
          scrollerClassName="overflow-x-auto md:max-h-[34rem] md:overflow-x-visible md:overflow-y-auto"
        >
          <ul className="flex w-max gap-2 p-1 md:w-auto md:flex-col">
            {images.map((image, index) => (
              <li key={image.url}>
                <button
                  type="button"
                  aria-label={t("storefront.showPhoto", {
                    index: String(index + 1),
                    total: String(total),
                  })}
                  aria-current={index === active ? "true" : undefined}
                  onClick={() => go(index)}
                  className={cn(
                    "block size-16 overflow-hidden rounded-[calc(var(--radius)-2px)] border-2 bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    index === active
                      ? "border-primary"
                      : "border-transparent opacity-80 hover:opacity-100",
                  )}
                >
                  <img
                    src={photoSrc(image.url, 160)}
                    alt=""
                    width={64}
                    height={64}
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        </ScrollShadow>
      ) : null}
    </section>
  );
}

function ArrowButton({
  side,
  label,
  disabled,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full border bg-background/90 text-foreground shadow-sm outline-none transition-opacity hover:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-0",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      <Icon aria-hidden className="size-5" />
    </button>
  );
}
