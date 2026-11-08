import type { ProductSuggestion } from "@monaztore/core";
import { ImageIcon, SearchIcon, XIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Form, href, useFetcher, useLocation, useNavigate } from "react-router";
import { useLocale, useT } from "~/lib/i18n";
import { photoSrc } from "~/lib/media";
import { formatPrice } from "~/lib/money";
import { cn } from "~/lib/utils";

/** The same as SUGGEST_MIN_LENGTH in core: fewer letters aren't worth asking. */
const MIN_LENGTH = 2;
/** How long typing must pause before asking for suggestions. */
const DEBOUNCE_MS = 150;

interface Suggestions {
  q: string;
  products: ProductSuggestion[];
}

/**
 * The store's search box, YouTube style: a combobox that suggests products with a small photo
 * as the shopper types (ARIA combobox with a listbox: arrows go through the list, Enter opens
 * the one marked, Escape closes it and then clears). The magnifier lives inside the field.
 * Without JavaScript it is a plain form to `/products?q=`, so searching always works.
 */
export function StoreSearch({ currency, className }: { currency: string; className?: string }) {
  const t = useT();
  const locale = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const fetcher = useFetcher<Suggestions>({ key: "store-search" });
  const id = useId();
  const inputId = `${id}-input`;
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${index}`;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The results page shows what was searched in the box; any other page starts it empty.
  const searched =
    location.pathname === href("/products")
      ? (new URLSearchParams(location.search).get("q") ?? "")
      : "";
  const [value, setValue] = useState(searched);
  const [lastSearched, setLastSearched] = useState(searched);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  if (lastSearched !== searched) {
    setLastSearched(searched);
    setValue(searched);
    setOpen(false);
    setActive(-1);
  }

  const q = value.trim();
  const products = fetcher.data?.products ?? [];
  const expanded = open && q.length >= MIN_LENGTH && fetcher.data !== undefined;
  // The products, then "See all results" as the last option.
  const count = products.length + 1;

  function ask(text: string) {
    clearTimeout(timer.current);
    const trimmed = text.trim();
    if (trimmed.length < MIN_LENGTH) return;
    timer.current = setTimeout(() => {
      fetcher.load(`${href("/search")}?${new URLSearchParams({ q: trimmed })}`);
    }, DEBOUNCE_MS);
  }

  function close() {
    setOpen(false);
    setActive(-1);
  }

  function choose(index: number) {
    close();
    const product = products[index];
    if (product) {
      setValue("");
      navigate(href("/products/:slug", { slug: product.slug }));
    } else {
      navigate(`${href("/products")}?${new URLSearchParams({ q })}`);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        if (!expanded) {
          setOpen(true);
          ask(value);
          return;
        }
        const step = event.key === "ArrowDown" ? 1 : -1;
        // -1 is the field itself, between the last option and the first.
        setActive((current) => ((current + step + 1 + count + 1) % (count + 1)) - 1);
        return;
      }
      case "Enter":
        if (expanded && active >= 0) {
          event.preventDefault();
          choose(active);
        } else {
          close();
        }
        return;
      case "Escape":
        if (expanded) {
          event.preventDefault();
          close();
        } else if (value) {
          event.preventDefault();
          setValue("");
        }
        return;
    }
  }

  return (
    <Form
      method="get"
      action={href("/products")}
      role="search"
      className={cn("relative", className)}
      onSubmit={close}
    >
      <label htmlFor={inputId} className="sr-only">
        {t("storefront.searchLabel")}
      </label>
      <input
        id={inputId}
        type="search"
        name="q"
        value={value}
        placeholder={t("storefront.searchPlaceholder")}
        autoComplete="off"
        enterKeyHint="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
        onChange={(event) => {
          setValue(event.target.value);
          setOpen(true);
          setActive(-1);
          ask(event.target.value);
        }}
        onFocus={() => {
          if (q.length >= MIN_LENGTH) setOpen(true);
        }}
        onBlur={close}
        onKeyDown={onKeyDown}
        className={cn(
          "h-11 w-full min-w-0 rounded-full border border-input bg-transparent pl-4 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground md:text-sm",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "[&::-webkit-search-cancel-button]:appearance-none",
          value ? "pr-22" : "pr-11",
        )}
      />
      <div className="absolute inset-y-0 right-0 flex items-center">
        {value ? (
          <button
            type="button"
            aria-label={t("storefront.searchClear")}
            // Keeps the focus in the field, so the shopper can type again at once.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setValue("");
              close();
              document.getElementById(inputId)?.focus();
            }}
            className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <XIcon aria-hidden className="size-4" />
          </button>
        ) : null}
        <button
          type="submit"
          aria-label={t("storefront.searchSubmit")}
          className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <SearchIcon aria-hidden className="size-5" />
        </button>
      </div>
      <div
        id={listId}
        role="listbox"
        aria-label={t("storefront.searchSuggestions")}
        hidden={!expanded}
        // A tap on an option must not blur the field first (that would close the list).
        onMouseDown={(event) => event.preventDefault()}
        className="absolute inset-x-0 top-full z-50 mt-1 max-h-[70dvh] overflow-y-auto rounded-xl border bg-card py-1 text-card-foreground shadow-lg"
      >
        {expanded
          ? products.map((product, index) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: the field's arrows and Enter pick options (aria-activedescendant).
              <div
                key={product.slug}
                tabIndex={-1}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                onClick={() => choose(index)}
                onMouseMove={() => setActive(index)}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1.5",
                  index === active && "bg-accent text-accent-foreground",
                )}
              >
                <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
                  {product.imageUrl ? (
                    <img
                      src={photoSrc(product.imageUrl, 160)}
                      alt=""
                      width={40}
                      height={40}
                      decoding="async"
                      className="size-full object-cover"
                    />
                  ) : (
                    <ImageIcon aria-hidden className="size-4 text-muted-foreground" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <Completion name={product.name} typed={q} />
                </span>
                {product.price !== null ? (
                  <span className="shrink-0 text-sm tabular-nums">
                    {formatPrice(product.price, currency, locale)}
                  </span>
                ) : null}
              </div>
            ))
          : null}
        {expanded ? (
          // biome-ignore lint/a11y/useKeyWithClickEvents: the field's arrows and Enter pick options (aria-activedescendant).
          <div
            id={optionId(products.length)}
            tabIndex={-1}
            role="option"
            aria-selected={active === products.length}
            onClick={() => choose(products.length)}
            onMouseMove={() => setActive(products.length)}
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1.5 text-sm",
              products.length > 0 && "border-t",
              active === products.length && "bg-accent text-accent-foreground",
            )}
          >
            <span className="grid size-10 shrink-0 place-items-center">
              <SearchIcon aria-hidden className="size-4" />
            </span>
            <span className="min-w-0 flex-1 truncate">{t("storefront.searchSeeAll", { q })}</span>
          </div>
        ) : null}
      </div>
      <p role="status" className="sr-only">
        {expanded
          ? products.length > 0
            ? t("storefront.searchSuggestionCount", { count: products.length })
            : t("storefront.searchNoSuggestions")
          : ""}
      </p>
    </Form>
  );
}

/** The name with what the shopper hasn't typed yet in bold, as YouTube completes. */
function Completion({ name, typed }: { name: string; typed: string }) {
  const start = name.toLocaleLowerCase().indexOf(typed.toLocaleLowerCase());
  if (!typed || start < 0) return <span className="font-semibold">{name}</span>;
  const end = start + typed.length;
  return (
    <>
      {start > 0 ? <span className="font-semibold">{name.slice(0, start)}</span> : null}
      {name.slice(start, end)}
      {end < name.length ? <span className="font-semibold">{name.slice(end)}</span> : null}
    </>
  );
}
