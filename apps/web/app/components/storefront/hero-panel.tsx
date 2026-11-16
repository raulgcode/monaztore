import type { StoreIllustrationId } from "@monaztore/contracts";
import { ArrowRightIcon, MessageCircleIcon, SparklesIcon } from "lucide-react";
import type * as React from "react";
import { Link } from "react-router";
import { Illustration } from "~/components/pages/illustrations";
import { cn } from "~/lib/utils";

export interface HeroAction {
  label: string;
  href: string;
}

export interface HeroPanelProps {
  /** h1 on the front page and a landing's first block; h2 further down a page. */
  as?: "h1" | "h2";
  eyebrow?: string;
  title: string;
  text?: string;
  imageUrl?: string | null;
  /** The same photo at 720 px: phones take it from `srcSet`. */
  smallImageUrl?: string | null;
  illustration?: StoreIllustrationId | null;
  action?: HeroAction | null;
  secondary?: HeroAction | null;
  /** The secondary button opens WhatsApp: its green, its icon. */
  secondaryIsWhatsapp?: boolean;
  /** The photo is the page's largest paint: it loads first. */
  eager?: boolean;
}

/** A link of the store (client-side), a block of the page (#…) or a site of its own (new tab). */
export function SmartLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (href.startsWith("/") && !href.startsWith("//")) {
    return (
      <Link to={href} className={className}>
        {children}
      </Link>
    );
  }
  const external = /^https?:/i.test(href);
  return (
    <a
      href={href}
      className={className}
      {...(external ? { rel: "noopener", target: "_blank" } : {})}
    >
      {children}
    </a>
  );
}

const pill =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-7 text-base font-semibold outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50";

export const heroButton = {
  primary: cn(pill, "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"),
  outline: cn(pill, "border bg-background text-foreground hover:border-primary"),
  whatsapp: cn(pill, "bg-whatsapp text-whatsapp-foreground shadow-sm hover:brightness-95"),
};

/**
 * The big opening of a page: a short line above, the title, a few words, its buttons and a photo
 * or one of the store's drawings. White, with the brand's soft accent as light behind it, so
 * the photo and the button are what stand out. Mobile first: the picture, then the words.
 */
export function HeroPanel({
  as: Heading = "h1",
  eyebrow,
  title,
  text,
  imageUrl,
  smallImageUrl,
  illustration,
  action,
  secondary,
  secondaryIsWhatsapp = false,
  eager = true,
}: HeroPanelProps) {
  const media = imageUrl ? (
    <div className="relative">
      <img
        src={imageUrl}
        srcSet={smallImageUrl ? `${smallImageUrl} 720w, ${imageUrl} 1600w` : undefined}
        sizes={smallImageUrl ? "(min-width: 768px) 36rem, 100vw" : undefined}
        alt=""
        width={1600}
        height={1200}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : undefined}
        decoding="async"
        className="aspect-[4/3] w-full rounded-2xl bg-muted object-cover shadow-lg ring-1 ring-border"
      />
    </div>
  ) : illustration ? (
    <Illustration id={illustration} className="mx-auto max-w-[17rem] @3xl:max-w-md" />
  ) : null;

  return (
    <section className="@container relative isolate overflow-hidden rounded-3xl border bg-card text-card-foreground">
      <div
        aria-hidden
        className="absolute -top-32 -right-32 -z-10 size-96 rounded-full bg-accent opacity-70 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute -bottom-40 -left-32 -z-10 size-80 rounded-full bg-accent opacity-50 blur-3xl"
      />
      <div
        className={cn(
          "grid items-center gap-8 px-5 py-8 @2xl:px-10 @2xl:py-12 @3xl:gap-12 @3xl:px-14 @3xl:py-16",
          media && "@3xl:grid-cols-[1.1fr_1fr]",
        )}
      >
        {media ? <div className="@3xl:order-last">{media}</div> : null}
        <div className={cn("grid justify-items-start gap-5", !media && "max-w-3xl")}>
          {eyebrow ? (
            <p className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold tracking-wide text-accent-foreground uppercase">
              <SparklesIcon aria-hidden className="size-3.5" />
              {eyebrow}
            </p>
          ) : null}
          <Heading className="font-heading text-4xl leading-[1.05] font-bold tracking-tight text-balance @2xl:text-5xl @5xl:text-6xl">
            {title}
          </Heading>
          {text ? (
            <p className="max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
              {text}
            </p>
          ) : null}
          {action || secondary ? (
            <div className="mt-1 grid w-full gap-3 @2xl:flex @2xl:w-auto @2xl:flex-wrap">
              {action ? (
                <SmartLink href={action.href} className={heroButton.primary}>
                  {action.label}
                  <ArrowRightIcon aria-hidden className="size-4" />
                </SmartLink>
              ) : null}
              {secondary ? (
                <SmartLink
                  href={secondary.href}
                  className={secondaryIsWhatsapp ? heroButton.whatsapp : heroButton.outline}
                >
                  {secondaryIsWhatsapp ? (
                    <MessageCircleIcon aria-hidden className="size-5" />
                  ) : null}
                  {secondary.label}
                </SmartLink>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
