import { type PageBlock, whatsappChatUrl } from "@monaztore/contracts";
import type { ProductCard } from "@monaztore/core";
import { ChevronDownIcon, MessageCircleIcon } from "lucide-react";
import { HeroPanel, heroButton } from "~/components/storefront/hero-panel";
import { ProductCarousel, ProductGrid } from "~/components/storefront/product-grid";
import { Collections, Highlights } from "~/components/storefront/store-home";
import { useT } from "~/lib/i18n";
import { useStoreShell } from "~/lib/store-theme";
import { cn } from "~/lib/utils";
import { Illustration } from "./illustrations";
import { InquiryForm, type InquiryFormContext } from "./inquiry-form";

const ownPath = (href: string) => href.startsWith("/") && !href.startsWith("//");

/**
 * A page's blocks as the storefront shows them; the workspace's editor draws its preview with
 * the same component. Text blocks hold HTML that core cleaned when the page was saved.
 */
export function PageBlocks({
  blocks,
  products,
  currency,
  emptyHint,
  landing = false,
  form,
  preview = false,
  collections: collectionsProp,
}: {
  blocks: PageBlock[];
  products: Record<string, ProductCard[]>;
  currency: string;
  /** Shown, in the editor's preview, where a block is still empty. */
  emptyHint?: string;
  /** A page that starts with a hero: full width, airy sections, text kept to a readable column. */
  landing?: boolean;
  /** What the page's request forms need (the signed time, Turnstile). */
  form?: InquiryFormContext;
  /** The workspace's preview: forms aren't sent and nothing sticks to the screen. */
  preview?: boolean;
  /** The store's categories, for a categories block (the storefront reads them from its frame). */
  collections?: { slug: string; name: string; imageUrl: string | null }[];
}) {
  const t = useT();
  const shell = useStoreShell();
  const collections = collectionsProp ?? shell?.collections ?? [];
  const card = shell?.theme.layout.productCard ?? "square";
  const chat = firstWhatsapp(blocks);
  return (
    <div className={cn("grid", landing ? "gap-14 md:gap-20" : "gap-6")}>
      {blocks.map((block, index) => (
        <div
          key={block.id}
          id={anchorOf(block.id)}
          className={cn(
            "min-w-0 scroll-mt-6",
            landing && narrowBlocks.has(block.type) && "mx-auto w-full max-w-3xl",
          )}
        >
          <Block
            block={block}
            first={index === 0}
            products={products[block.id] ?? []}
            currency={currency}
            emptyHint={emptyHint}
            chat={chat}
            form={form}
            preview={preview}
            collections={collections}
            card={card}
          />
        </div>
      ))}
      {chat && landing && !preview ? (
        // On the phone, the chat stays in reach of the thumb all the way down the page.
        <div
          data-sticky-action
          className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 backdrop-blur md:hidden"
        >
          <a
            href={chat.url}
            rel="noopener"
            target="_blank"
            className={cn(heroButton.whatsapp, "w-full")}
          >
            <MessageCircleIcon aria-hidden className="size-5" />
            {chat.label || t("storefront.whatsappChat")}
          </a>
        </div>
      ) : null}
    </div>
  );
}

/** Blocks that read best in a column, even on a full-width landing. */
const narrowBlocks = new Set<PageBlock["type"]>(["text", "image", "button", "faq"]);

/** A block id usable as `#anchor` ("request", "how-it-works"); others get none. */
function anchorOf(id: string): string | undefined {
  return /^[a-z][a-z0-9-]{0,39}$/i.test(id) ? id : undefined;
}

/** The page's first WhatsApp block with a usable number: the hero and the phone bar open it. */
function firstWhatsapp(blocks: PageBlock[]) {
  for (const block of blocks) {
    if (block.type !== "whatsapp") continue;
    const url = whatsappChatUrl(block.phone, block.message);
    if (url) return { url, label: block.label };
  }
  return null;
}

function Empty({ hint }: { hint?: string }) {
  if (!hint) return null;
  return (
    <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
      {hint}
    </p>
  );
}

function Block({
  block,
  first,
  products,
  currency,
  emptyHint,
  chat,
  form,
  preview,
  collections,
  card,
}: {
  block: PageBlock;
  first: boolean;
  collections: { slug: string; name: string; imageUrl: string | null }[];
  card: "square" | "portrait" | "row";
  products: ProductCard[];
  currency: string;
  emptyHint?: string;
  chat: { url: string; label: string } | null;
  form?: InquiryFormContext;
  preview: boolean;
}) {
  const t = useT();
  switch (block.type) {
    case "collections":
      if (collections.length === 0) return <Empty hint={emptyHint} />;
      return (
        <Collections
          collections={collections}
          layout={{ productCard: card }}
          heading={block.title || undefined}
          limit={block.limit}
        />
      );
    case "highlights": {
      const items = block.items.filter((item) => item.trim());
      if (items.length === 0) return <Empty hint={emptyHint} />;
      return <Highlights items={items} />;
    }
    case "hero":
      if (!block.title.trim()) return <Empty hint={emptyHint} />;
      return (
        <HeroPanel
          as={first ? "h1" : "h2"}
          eyebrow={block.eyebrow}
          title={block.title}
          text={block.text}
          imageUrl={block.image || null}
          illustration={block.illustration || null}
          eager={first}
          action={
            block.buttonLabel.trim() && block.buttonHref
              ? { label: block.buttonLabel, href: block.buttonHref }
              : null
          }
          secondary={
            chat ? { label: chat.label || t("storefront.whatsappChat"), href: chat.url } : null
          }
          secondaryIsWhatsapp
        />
      );
    case "steps": {
      const items = block.items.filter((item) => item.title.trim());
      if (items.length === 0) return <Empty hint={emptyHint} />;
      const columns =
        items.length >= 5
          ? "lg:grid-cols-5"
          : items.length === 4
            ? "lg:grid-cols-4"
            : "lg:grid-cols-3";
      return (
        <section className="grid gap-8">
          {block.title || block.intro ? (
            <div className="mx-auto grid max-w-2xl gap-3 text-center">
              {block.title ? (
                <h2 className="font-heading text-3xl font-bold tracking-tight text-balance md:text-4xl">
                  {block.title}
                </h2>
              ) : null}
              {block.intro ? (
                <p className="text-lg text-pretty text-muted-foreground">{block.intro}</p>
              ) : null}
            </div>
          ) : null}
          <ol className={cn("grid gap-4 sm:grid-cols-2", columns)}>
            {items.map((item, index) => (
              <li
                key={`${index}-${item.title}`}
                className="grid grid-cols-[6.5rem_1fr] items-center gap-4 rounded-2xl border bg-card p-4 sm:grid-cols-1 sm:content-start sm:items-start sm:p-5"
              >
                <Illustration id={item.illustration} className="sm:mx-auto sm:max-w-[11rem]" />
                <div className="grid gap-2">
                  <p className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
                    >
                      {index + 1}
                    </span>
                    <span className="sr-only">
                      {t("storefront.stepLabel", { n: String(index + 1) })}
                    </span>
                  </p>
                  <h3 className="text-lg leading-snug font-semibold">{item.title}</h3>
                  {item.text ? (
                    <p className="text-pretty text-muted-foreground">{item.text}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      );
    }
    case "whatsapp": {
      const url = whatsappChatUrl(block.phone, block.message);
      if (!url) return <Empty hint={emptyHint} />;
      return (
        <section className="relative isolate grid justify-items-center gap-4 overflow-hidden rounded-3xl border bg-card px-5 py-10 text-center sm:px-10 md:py-14">
          <div
            aria-hidden
            className="absolute -top-24 left-1/2 -z-10 size-72 -translate-x-1/2 rounded-full bg-accent opacity-70 blur-3xl"
          />
          <span className="grid size-16 place-items-center rounded-full bg-whatsapp text-whatsapp-foreground shadow-sm">
            <MessageCircleIcon aria-hidden className="size-8" />
          </span>
          {block.title ? (
            <h2 className="font-heading text-3xl font-bold tracking-tight text-balance md:text-4xl">
              {block.title}
            </h2>
          ) : null}
          {block.text ? (
            <p className="max-w-xl text-lg text-pretty text-muted-foreground">{block.text}</p>
          ) : null}
          <a
            href={url}
            rel="noopener"
            target="_blank"
            className={cn(heroButton.whatsapp, "mt-2 min-h-14 w-full px-8 text-lg sm:w-auto")}
          >
            <MessageCircleIcon aria-hidden className="size-6" />
            {block.label || t("storefront.whatsappChat")}
          </a>
        </section>
      );
    }
    case "form":
      return (
        <section className="grid gap-8 rounded-3xl border bg-card p-5 sm:p-10 md:grid-cols-[1fr_1.4fr] md:items-start">
          <div className="grid content-start gap-3">
            <h2 className="font-heading text-3xl font-bold tracking-tight text-balance md:text-4xl">
              {block.title || t("storefront.formSubmitDefault")}
            </h2>
            {block.text ? (
              <p className="text-lg text-pretty text-muted-foreground">{block.text}</p>
            ) : null}
            <Illustration id="chat" className="hidden max-w-[16rem] md:block" />
          </div>
          <InquiryForm block={block} context={form} preview={preview} />
        </section>
      );
    case "heading": {
      if (!block.text.trim()) return <Empty hint={emptyHint} />;
      const Tag = block.level === 3 ? "h3" : "h2";
      return (
        <Tag
          className={cn(
            "font-semibold tracking-tight",
            block.level === 3 ? "text-lg" : "text-xl sm:text-2xl",
          )}
        >
          {block.text}
        </Tag>
      );
    }
    case "text":
      if (!block.html.replace(/<[^>]*>/g, "").trim()) return <Empty hint={emptyHint} />;
      return (
        <div
          className="store-prose"
          // Cleaned in @monaztore/core (`cleanBlocks`) on every save.
          dangerouslySetInnerHTML={{ __html: block.html }}
        />
      );
    case "image":
      if (!block.url) return <Empty hint={emptyHint} />;
      return (
        <figure className="grid gap-2">
          <img
            src={block.url}
            alt={block.alt}
            loading="lazy"
            decoding="async"
            className="w-full rounded-md bg-muted object-cover"
          />
          {block.caption ? (
            <figcaption className="text-center text-sm text-muted-foreground">
              {block.caption}
            </figcaption>
          ) : null}
        </figure>
      );
    case "button":
      if (!block.label.trim() || !block.href) return <Empty hint={emptyHint} />;
      return (
        <div>
          <a
            href={block.href}
            {...(ownPath(block.href) ? {} : { rel: "noopener", target: "_blank" })}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-6 font-medium text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-auto"
          >
            {block.label}
          </a>
        </div>
      );
    case "faq": {
      const items = block.items.filter((item) => item.question.trim());
      if (items.length === 0) return <Empty hint={emptyHint} />;
      return (
        <div className="divide-y rounded-md border">
          {items.map((item, index) => (
            <details key={index} className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                {item.question}
                <ChevronDownIcon
                  aria-hidden
                  className="size-5 shrink-0 transition-transform group-open:rotate-180"
                />
              </summary>
              <p className="whitespace-pre-line px-4 pb-4 text-muted-foreground">{item.answer}</p>
            </details>
          ))}
        </div>
      );
    }
    case "products":
      if (products.length === 0) return <Empty hint={emptyHint} />;
      return (
        <section className="grid gap-4">
          {block.title ? (
            <h2 className="font-heading text-xl font-semibold tracking-tight md:text-2xl">
              {block.title}
            </h2>
          ) : null}
          {block.layout === "carousel" ? (
            <ProductCarousel
              products={products}
              currency={currency}
              variant={card}
              label={block.title || t("storefront.featured")}
            />
          ) : (
            <ProductGrid products={products} currency={currency} variant={card} />
          )}
        </section>
      );
  }
}

/** The questions of a page's FAQ blocks, as schema.org FAQPage for search engines. */
export function faqJsonLd(blocks: PageBlock[]) {
  const questions = blocks.flatMap((block) =>
    block.type === "faq"
      ? block.items.filter((item) => item.question.trim() && item.answer.trim())
      : [],
  );
  if (questions.length === 0) return null;
  return {
    "script:ld+json": {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: questions.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
  };
}
