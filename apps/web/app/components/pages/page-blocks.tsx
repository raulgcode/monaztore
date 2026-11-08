import type { PageBlock } from "@monaztore/contracts";
import type { ProductCard } from "@monaztore/core";
import { ChevronDownIcon } from "lucide-react";
import { ProductGrid } from "~/components/storefront/product-grid";
import { cn } from "~/lib/utils";

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
}: {
  blocks: PageBlock[];
  products: Record<string, ProductCard[]>;
  currency: string;
  /** Shown, in the editor's preview, where a block is still empty. */
  emptyHint?: string;
}) {
  return (
    <div className="grid gap-6">
      {blocks.map((block) => (
        <Block
          key={block.id}
          block={block}
          products={products[block.id] ?? []}
          currency={currency}
          emptyHint={emptyHint}
        />
      ))}
    </div>
  );
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
  products,
  currency,
  emptyHint,
}: {
  block: PageBlock;
  products: ProductCard[];
  currency: string;
  emptyHint?: string;
}) {
  switch (block.type) {
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
            <h2 className="text-xl font-semibold tracking-tight">{block.title}</h2>
          ) : null}
          <ProductGrid products={products} currency={currency} />
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
