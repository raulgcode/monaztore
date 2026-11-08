import {
  emptyBlock,
  type PageBlock,
  type PageBlockType,
  pageBlockTypes,
} from "@monaztore/contracts";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BoldIcon,
  ImageIcon,
  ItalicIcon,
  LayoutGridIcon,
  LinkIcon,
  ListIcon,
  type LucideIcon,
  MessageCircleQuestionIcon,
  MousePointerClickIcon,
  PlusIcon,
  TextIcon,
  Trash2Icon,
  TypeIcon,
} from "lucide-react";
import { useId, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useT } from "~/lib/i18n";
import { cn } from "~/lib/utils";

const blockIcons: Record<PageBlockType, LucideIcon> = {
  heading: TypeIcon,
  text: TextIcon,
  image: ImageIcon,
  button: MousePointerClickIcon,
  faq: MessageCircleQuestionIcon,
  products: LayoutGridIcon,
};

const blockLabelKeys = {
  heading: "pages.blockHeading",
  text: "pages.blockText",
  image: "pages.blockImage",
  button: "pages.blockButton",
  faq: "pages.blockFaq",
  products: "pages.blockProducts",
} as const;

const blockHintKeys = {
  heading: "pages.blockHeadingHint",
  text: "pages.blockTextHint",
  image: "pages.blockImageHint",
  button: "pages.blockButtonHint",
  faq: "pages.blockFaqHint",
  products: "pages.blockProductsHint",
} as const;

export interface BlockEditorProps {
  blocks: PageBlock[];
  onChange: (blocks: PageBlock[]) => void;
  collections: { slug: string; name: string }[];
  /** Uploads a photo for an image block; the editor shows the result when it comes back. */
  onUpload: (blockId: string, file: File) => void;
  uploading: string | null;
  uploadFailed: string | null;
  disabled?: boolean;
}

/** A new block's id: short, unique within the page. */
function newId(blocks: PageBlock[]): string {
  let n = blocks.length + 1;
  while (blocks.some((block) => block.id === `b${n}`)) n++;
  return `b${n}`;
}

/**
 * The page's blocks, one card each: its fields, move up or down, remove. Everything is a tap:
 * no dragging, no hover. "Add a block" opens the kinds of block to choose from.
 */
export function BlockEditor({
  blocks,
  onChange,
  collections,
  onUpload,
  uploading,
  uploadFailed,
  disabled,
}: BlockEditorProps) {
  const t = useT();
  const [adding, setAdding] = useState(false);

  const update = (id: string, next: PageBlock) =>
    onChange(blocks.map((block) => (block.id === id ? next : block)));
  const move = (index: number, by: -1 | 1) => {
    const next = [...blocks];
    const [moved] = next.splice(index, 1);
    if (moved) next.splice(index + by, 0, moved);
    onChange(next);
  };
  const add = (type: PageBlockType) => {
    onChange([...blocks, emptyBlock(type, newId(blocks))]);
    setAdding(false);
  };

  return (
    <div className="grid gap-4">
      {blocks.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          {t("pages.noBlocks")}
        </p>
      ) : null}
      <ol className="grid gap-4">
        {blocks.map((block, index) => {
          const Icon = blockIcons[block.type];
          const label = `${index + 1}. ${t(blockLabelKeys[block.type])}`;
          return (
            <li key={block.id} className="rounded-md border bg-card">
              <fieldset disabled={disabled} className="grid gap-3 p-3">
                <legend className="sr-only">{label}</legend>
                <div className="flex items-center gap-1">
                  <Icon aria-hidden className="size-4 text-muted-foreground" />
                  <span aria-hidden className="flex-1 text-sm font-medium">
                    {label}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("pages.moveUp", { block: label })}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUpIcon aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("pages.moveDown", { block: label })}
                    disabled={index === blocks.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDownIcon aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("pages.removeBlock", { block: label })}
                    onClick={() => onChange(blocks.filter((other) => other.id !== block.id))}
                  >
                    <Trash2Icon aria-hidden />
                  </Button>
                </div>
                <BlockFields
                  block={block}
                  onChange={(next) => update(block.id, next)}
                  collections={collections}
                  onUpload={onUpload}
                  uploading={uploading === block.id}
                  uploadFailed={uploadFailed === block.id}
                />
              </fieldset>
            </li>
          );
        })}
      </ol>

      {adding ? (
        <div className="grid gap-2 rounded-md border p-3">
          <ul className="grid gap-2 sm:grid-cols-2">
            {pageBlockTypes.map((type) => {
              const Icon = blockIcons[type];
              return (
                <li key={type}>
                  <button
                    type="button"
                    onClick={() => add(type)}
                    className="flex min-h-14 w-full items-center gap-3 rounded-md border px-3 py-2 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <Icon aria-hidden className="size-5 shrink-0" />
                    <span className="grid">
                      <span className="font-medium">{t(blockLabelKeys[type])}</span>
                      <span className="text-sm text-muted-foreground">
                        {t(blockHintKeys[type])}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
            {t("pages.closeBlocks")}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => setAdding(true)}
          aria-expanded={false}
        >
          <PlusIcon aria-hidden />
          {t("pages.addBlock")}
        </Button>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (props: { id: string; "aria-describedby"?: string }) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children({ id, "aria-describedby": hint ? `${id}-hint` : undefined })}
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const selectClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm";

function BlockFields({
  block,
  onChange,
  collections,
  onUpload,
  uploading,
  uploadFailed,
}: {
  block: PageBlock;
  onChange: (block: PageBlock) => void;
  collections: { slug: string; name: string }[];
  onUpload: (blockId: string, file: File) => void;
  uploading: boolean;
  uploadFailed: boolean;
}) {
  const t = useT();
  switch (block.type) {
    case "heading":
      return (
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
          <Field label={t("pages.headingText")}>
            {(props) => (
              <Input
                {...props}
                value={block.text}
                maxLength={200}
                onChange={(event) => onChange({ ...block, text: event.target.value })}
              />
            )}
          </Field>
          <Field label={t("pages.headingSize")}>
            {(props) => (
              <select
                {...props}
                className={selectClass}
                value={block.level}
                onChange={(event) =>
                  onChange({ ...block, level: event.target.value === "3" ? 3 : 2 })
                }
              >
                <option value={2}>{t("pages.headingBig")}</option>
                <option value={3}>{t("pages.headingMedium")}</option>
              </select>
            )}
          </Field>
        </div>
      );
    case "text":
      return <RichText html={block.html} onChange={(html) => onChange({ ...block, html })} />;
    case "image":
      return (
        <div className="grid gap-3">
          {block.url ? (
            <img
              src={block.url}
              alt=""
              className="max-h-48 w-full rounded-md bg-muted object-contain"
            />
          ) : null}
          <Field label={t("pages.imageUpload")}>
            {(props) => (
              <Input
                {...props}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="h-auto py-2"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onUpload(block.id, file);
                  event.target.value = "";
                }}
              />
            )}
          </Field>
          {uploading ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t("pages.imageUploading")}
            </p>
          ) : null}
          {uploadFailed ? (
            <p role="alert" className="text-sm text-destructive">
              {t("pages.imageUploadFailed")}
            </p>
          ) : null}
          <Field label={t("pages.imageAlt")} hint={t("pages.imageAltHint")}>
            {(props) => (
              <Input
                {...props}
                value={block.alt}
                maxLength={200}
                onChange={(event) => onChange({ ...block, alt: event.target.value })}
              />
            )}
          </Field>
          <Field label={t("pages.imageCaption")}>
            {(props) => (
              <Input
                {...props}
                value={block.caption}
                maxLength={200}
                onChange={(event) => onChange({ ...block, caption: event.target.value })}
              />
            )}
          </Field>
        </div>
      );
    case "button":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("pages.buttonLabel")}>
            {(props) => (
              <Input
                {...props}
                value={block.label}
                maxLength={60}
                onChange={(event) => onChange({ ...block, label: event.target.value })}
              />
            )}
          </Field>
          <Field label={t("pages.buttonHref")} hint={t("pages.buttonHrefHint")}>
            {(props) => (
              <Input
                {...props}
                value={block.href}
                maxLength={500}
                inputMode="url"
                onChange={(event) => onChange({ ...block, href: event.target.value.trim() })}
              />
            )}
          </Field>
        </div>
      );
    case "faq":
      return (
        <div className="grid gap-4">
          {block.items.map((item, index) => {
            const n = String(index + 1);
            const set = (patch: Partial<typeof item>) =>
              onChange({
                ...block,
                items: block.items.map((other, at) =>
                  at === index ? { ...other, ...patch } : other,
                ),
              });
            return (
              <div key={index} className="grid gap-2 border-l-2 pl-3">
                <Field label={t("pages.faqQuestion", { n })}>
                  {(props) => (
                    <Input
                      {...props}
                      value={item.question}
                      maxLength={300}
                      onChange={(event) => set({ question: event.target.value })}
                    />
                  )}
                </Field>
                <Field label={t("pages.faqAnswer", { n })}>
                  {(props) => (
                    <textarea
                      {...props}
                      rows={3}
                      maxLength={3000}
                      value={item.answer}
                      onChange={(event) => set({ answer: event.target.value })}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
                    />
                  )}
                </Field>
                {block.items.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="justify-self-start"
                    onClick={() =>
                      onChange({ ...block, items: block.items.filter((_, at) => at !== index) })
                    }
                  >
                    <Trash2Icon aria-hidden />
                    {t("pages.removeQuestion", { n })}
                  </Button>
                ) : null}
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            disabled={block.items.length >= 60}
            onClick={() =>
              onChange({ ...block, items: [...block.items, { question: "", answer: "" }] })
            }
          >
            <PlusIcon aria-hidden />
            {t("pages.addQuestion")}
          </Button>
        </div>
      );
    case "products":
      return (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem]">
          <Field label={t("pages.productsTitle")}>
            {(props) => (
              <Input
                {...props}
                value={block.title}
                maxLength={120}
                onChange={(event) => onChange({ ...block, title: event.target.value })}
              />
            )}
          </Field>
          <Field label={t("pages.productsCollection")}>
            {(props) => (
              <select
                {...props}
                className={selectClass}
                value={block.collection}
                onChange={(event) => onChange({ ...block, collection: event.target.value })}
              >
                <option value="">{t("pages.productsNewest")}</option>
                {collections.map((collection) => (
                  <option key={collection.slug} value={collection.slug}>
                    {collection.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t("pages.productsLimit")}>
            {(props) => (
              <select
                {...props}
                className={selectClass}
                value={block.limit}
                onChange={(event) => onChange({ ...block, limit: Number(event.target.value) })}
              >
                {[2, 3, 4, 6, 8, 12].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      );
  }
}

/**
 * Formatted text, written in place like in a word processor: bold, italics, links and lists.
 * What it writes is HTML that core cleans on every save; pasting keeps only the text.
 */
export function RichText({
  html,
  onChange,
  label,
}: {
  html: string;
  onChange: (html: string) => void;
  /** What the text is; "Text" by default. Its toolbar's names come from `pages`. */
  label?: string;
}) {
  const t = useT();
  const id = useId();
  // Uncontrolled: the browser keeps the caret; the first HTML goes in once.
  const [initial] = useState(html);
  const run = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    const editor = document.getElementById(id);
    if (editor) onChange(editor.innerHTML);
  };
  const tools: { label: string; icon: LucideIcon; action: () => void }[] = [
    { label: t("pages.bold"), icon: BoldIcon, action: () => run("bold") },
    { label: t("pages.italic"), icon: ItalicIcon, action: () => run("italic") },
    {
      label: t("pages.link"),
      icon: LinkIcon,
      action: () => {
        const href = window.prompt(t("pages.linkPrompt"))?.trim();
        if (href && (/^https?:\/\//i.test(href) || /^\/(?!\/)/.test(href))) run("createLink", href);
      },
    },
    { label: t("pages.list"), icon: ListIcon, action: () => run("insertUnorderedList") },
  ];
  return (
    <div className="grid gap-2">
      <span id={`${id}-label`} className="text-sm font-medium">
        {label ?? t("pages.textLabel")}
      </span>
      <div className="overflow-hidden rounded-md border border-input focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
        <div role="toolbar" aria-labelledby={`${id}-label`} className="flex gap-1 border-b p-1">
          {tools.map(({ label, icon: Icon, action }) => (
            <Button
              key={label}
              type="button"
              variant="ghost"
              size="icon"
              aria-label={label}
              title={label}
              // Keeps the selection in the text while the button is pressed.
              onMouseDown={(event) => event.preventDefault()}
              onClick={action}
            >
              <Icon aria-hidden />
            </Button>
          ))}
        </div>
        {/* biome-ignore lint/a11y/useSemanticElements: a textarea can't hold bold, links or lists. */}
        <div
          id={id}
          role="textbox"
          aria-multiline="true"
          aria-labelledby={`${id}-label`}
          tabIndex={0}
          contentEditable
          suppressContentEditableWarning
          className={cn(
            "store-prose min-h-32 px-3 py-2 text-base outline-none md:text-sm",
            "[&:empty]:before:text-muted-foreground",
          )}
          onInput={(event) => onChange(event.currentTarget.innerHTML)}
          onPaste={(event) => {
            event.preventDefault();
            document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
          }}
          dangerouslySetInnerHTML={{ __html: initial }}
        />
      </div>
    </div>
  );
}
