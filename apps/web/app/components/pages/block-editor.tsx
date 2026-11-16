import {
  emptyBlock,
  HIGHLIGHTS_BLOCK_MAX,
  type PageBlock,
  type PageBlockType,
  pageBlockTypes,
  STEPS_MAX,
} from "@monaztore/contracts";
import { type StoreIllustrationId, storeIllustrationIds } from "@monaztore/contracts/illustrations";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BoldIcon,
  FootprintsIcon,
  GripVerticalIcon,
  ImageIcon,
  ItalicIcon,
  LayersIcon,
  LayoutGridIcon,
  LinkIcon,
  ListIcon,
  type LucideIcon,
  MailIcon,
  MegaphoneIcon,
  MessageCircleIcon,
  MessageCircleQuestionIcon,
  MousePointerClickIcon,
  PanelTopIcon,
  PlusIcon,
  SparklesIcon,
  TextIcon,
  Trash2Icon,
  TypeIcon,
} from "lucide-react";
import { useId, useRef, useState } from "react";
import { illustrationKeys } from "~/components/pages/illustration-options";
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
  collections: LayersIcon,
  highlights: SparklesIcon,
  hero: PanelTopIcon,
  steps: FootprintsIcon,
  whatsapp: MessageCircleIcon,
  form: MailIcon,
  cta: MegaphoneIcon,
};

const blockLabelKeys = {
  heading: "pages.blockHeading",
  text: "pages.blockText",
  image: "pages.blockImage",
  button: "pages.blockButton",
  faq: "pages.blockFaq",
  products: "pages.blockProducts",
  collections: "pages.blockCollections",
  highlights: "pages.blockHighlights",
  hero: "pages.blockHero",
  steps: "pages.blockSteps",
  whatsapp: "pages.blockWhatsapp",
  form: "pages.blockForm",
  cta: "pages.blockCta",
} as const;

const blockHintKeys = {
  heading: "pages.blockHeadingHint",
  text: "pages.blockTextHint",
  image: "pages.blockImageHint",
  button: "pages.blockButtonHint",
  faq: "pages.blockFaqHint",
  products: "pages.blockProductsHint",
  collections: "pages.blockCollectionsHint",
  highlights: "pages.blockHighlightsHint",
  hero: "pages.blockHeroHint",
  steps: "pages.blockStepsHint",
  whatsapp: "pages.blockWhatsappHint",
  form: "pages.blockFormHint",
  cta: "pages.blockCtaHint",
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
  // Dragging a block by its handle: the list reorders under the finger as it goes.
  const list = useRef<HTMLOListElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const moveTo = (id: string, target: number) => {
    const from = blocks.findIndex((block) => block.id === id);
    if (from < 0 || from === target) return;
    const next = [...blocks];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(target, 0, moved);
    onChange(next);
  };
  const dragOver = (id: string, y: number) => {
    // Its new place: how many of the other blocks have their middle above the finger.
    const others = [...(list.current?.querySelectorAll<HTMLElement>("[data-block]") ?? [])].filter(
      (item) => item.dataset.block !== id,
    );
    const index = others.filter((item) => {
      const box = item.getBoundingClientRect();
      return box.top + box.height / 2 < y;
    }).length;
    moveTo(id, index);
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
      <p className="text-sm text-muted-foreground">{t("pages.dragHint")}</p>
      <ol ref={list} className="grid gap-4">
        {blocks.map((block, index) => {
          const Icon = blockIcons[block.type];
          const label = `${index + 1}. ${t(blockLabelKeys[block.type])}`;
          return (
            <li
              key={block.id}
              data-block={block.id}
              className={cn(
                "rounded-md border bg-card transition-shadow motion-reduce:transition-none",
                dragging === block.id &&
                  "relative z-10 border-primary shadow-lg ring-2 ring-primary/40",
              )}
            >
              <fieldset disabled={disabled} className="grid gap-3 p-3">
                <legend className="sr-only">{label}</legend>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={t("pages.dragBlock", { block: label })}
                    title={t("pages.dragBlock", { block: label })}
                    className="-ml-1 inline-flex size-11 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing"
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setDragging(block.id);
                    }}
                    onPointerMove={(event) => {
                      if (dragging === block.id) dragOver(block.id, event.clientY);
                    }}
                    onPointerUp={() => setDragging(null)}
                    onPointerCancel={() => setDragging(null)}
                    onKeyDown={(event) => {
                      // The keyboard moves it too: arrows up and down.
                      if (event.key === "ArrowUp" && index > 0) {
                        event.preventDefault();
                        move(index, -1);
                      } else if (event.key === "ArrowDown" && index < blocks.length - 1) {
                        event.preventDefault();
                        move(index, 1);
                      }
                    }}
                  >
                    <GripVerticalIcon aria-hidden className="size-5" />
                  </button>
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
        <div className="grid gap-3">
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
          <Field label={t("pages.productsLayout")}>
            {(props) => (
              <select
                {...props}
                className={selectClass}
                value={block.layout}
                onChange={(event) =>
                  onChange({
                    ...block,
                    layout: event.target.value === "carousel" ? "carousel" : "grid",
                  })
                }
              >
                <option value="grid">{t("pages.productsGrid")}</option>
                <option value="carousel">{t("pages.productsCarousel")}</option>
              </select>
            )}
          </Field>
          <CheckField
            label={t("pages.productsOnSale")}
            checked={block.onSale}
            onChange={(onSale) => onChange({ ...block, onSale })}
          />
        </div>
      );
    case "collections":
      return (
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
          <TextInput
            label={t("pages.collectionsTitle")}
            value={block.title}
            max={120}
            onChange={(title) => onChange({ ...block, title })}
          />
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
    case "highlights":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: HIGHLIGHTS_BLOCK_MAX }, (_, index) => (
            <TextInput
              key={index}
              label={t("pages.highlightItem", { n: String(index + 1) })}
              value={block.items[index] ?? ""}
              max={60}
              onChange={(value) => {
                const items = Array.from({ length: HIGHLIGHTS_BLOCK_MAX }, (_, at) =>
                  at === index ? value : (block.items[at] ?? ""),
                );
                // Keeps the rows the person sees; empty ones at the end go away on save.
                while (items.length > 0 && items.at(-1) === "") items.pop();
                onChange({ ...block, items });
              }}
            />
          ))}
        </div>
      );
    case "hero":
      return (
        <div className="grid gap-3">
          <TextInput
            label={t("pages.heroEyebrow")}
            hint={t("pages.heroEyebrowHint")}
            value={block.eyebrow}
            max={60}
            onChange={(eyebrow) => onChange({ ...block, eyebrow })}
          />
          <TextInput
            label={t("pages.heroTitle")}
            value={block.title}
            max={120}
            onChange={(title) => onChange({ ...block, title })}
          />
          <TextArea
            label={t("pages.heroText")}
            value={block.text}
            max={400}
            onChange={(text) => onChange({ ...block, text })}
          />
          {block.image ? (
            <div className="grid gap-2">
              <img
                src={block.image}
                alt=""
                className="max-h-48 w-full rounded-md bg-muted object-contain"
              />
              <Button
                type="button"
                variant="ghost"
                className="justify-self-start"
                onClick={() => onChange({ ...block, image: "" })}
              >
                <Trash2Icon aria-hidden />
                {t("pages.heroRemoveImage")}
              </Button>
            </div>
          ) : null}
          <ImageUpload
            label={t("pages.heroImage")}
            hint={t("pages.heroImageHint")}
            onFile={(file) => onUpload(block.id, file)}
            uploading={uploading}
            uploadFailed={uploadFailed}
          />
          <IllustrationSelect
            label={t("pages.illustration")}
            value={block.illustration}
            allowNone
            onChange={(illustration) => onChange({ ...block, illustration })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              label={t("pages.buttonLabel")}
              value={block.buttonLabel}
              max={60}
              onChange={(buttonLabel) => onChange({ ...block, buttonLabel })}
            />
            <TextInput
              label={t("pages.buttonHref")}
              hint={t("pages.buttonHrefHint")}
              value={block.buttonHref}
              max={500}
              inputMode="url"
              onChange={(buttonHref) => onChange({ ...block, buttonHref: buttonHref.trim() })}
            />
          </div>
        </div>
      );
    case "cta":
      return (
        <div className="grid gap-3">
          <TextInput
            label={t("pages.ctaTitle")}
            value={block.title}
            max={120}
            onChange={(title) => onChange({ ...block, title })}
          />
          <TextArea
            label={t("pages.ctaText")}
            value={block.text}
            max={400}
            onChange={(text) => onChange({ ...block, text })}
          />
          <IllustrationSelect
            label={t("pages.illustration")}
            value={block.illustration}
            allowNone
            onChange={(illustration) => onChange({ ...block, illustration })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              label={t("pages.buttonLabel")}
              value={block.buttonLabel}
              max={60}
              onChange={(buttonLabel) => onChange({ ...block, buttonLabel })}
            />
            <TextInput
              label={t("pages.buttonHref")}
              hint={t("pages.buttonHrefHint")}
              value={block.buttonHref}
              max={500}
              inputMode="url"
              onChange={(buttonHref) => onChange({ ...block, buttonHref: buttonHref.trim() })}
            />
          </div>
        </div>
      );
    case "steps":
      return (
        <div className="grid gap-4">
          <TextInput
            label={t("pages.stepsTitle")}
            value={block.title}
            max={120}
            onChange={(title) => onChange({ ...block, title })}
          />
          <TextArea
            label={t("pages.stepsIntro")}
            value={block.intro}
            max={400}
            onChange={(intro) => onChange({ ...block, intro })}
          />
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
                <IllustrationSelect
                  label={t("pages.stepIllustration", { n })}
                  value={item.illustration}
                  onChange={(illustration) => set({ illustration: illustration || "photo" })}
                />
                <TextInput
                  label={t("pages.stepTitle", { n })}
                  value={item.title}
                  max={80}
                  onChange={(title) => set({ title })}
                />
                <TextArea
                  label={t("pages.stepText", { n })}
                  value={item.text}
                  max={400}
                  onChange={(text) => set({ text })}
                />
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
                    {t("pages.removeStep", { n })}
                  </Button>
                ) : null}
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            disabled={block.items.length >= STEPS_MAX}
            onClick={() =>
              onChange({
                ...block,
                items: [...block.items, { illustration: "photo", title: "", text: "" }],
              })
            }
          >
            <PlusIcon aria-hidden />
            {t("pages.addStep")}
          </Button>
        </div>
      );
    case "whatsapp":
      return (
        <div className="grid gap-3">
          <TextInput
            label={t("pages.whatsappTitle")}
            value={block.title}
            max={120}
            onChange={(title) => onChange({ ...block, title })}
          />
          <TextArea
            label={t("pages.whatsappText")}
            value={block.text}
            max={400}
            onChange={(text) => onChange({ ...block, text })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              label={t("pages.whatsappLabel")}
              value={block.label}
              max={60}
              onChange={(label) => onChange({ ...block, label })}
            />
            <TextInput
              label={t("pages.whatsappPhone")}
              hint={t("pages.whatsappPhoneHint")}
              value={block.phone}
              max={20}
              inputMode="tel"
              onChange={(phone) => onChange({ ...block, phone })}
            />
          </div>
          <TextArea
            label={t("pages.whatsappMessage")}
            value={block.message}
            max={300}
            onChange={(message) => onChange({ ...block, message })}
          />
        </div>
      );
    case "form":
      return (
        <div className="grid gap-3">
          <TextInput
            label={t("pages.formTitle")}
            value={block.title}
            max={120}
            onChange={(title) => onChange({ ...block, title })}
          />
          <TextArea
            label={t("pages.formText")}
            value={block.text}
            max={400}
            onChange={(text) => onChange({ ...block, text })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              label={t("pages.formMessageLabel")}
              hint={t("pages.formMessageLabelHint")}
              value={block.messageLabel}
              max={80}
              onChange={(messageLabel) => onChange({ ...block, messageLabel })}
            />
            <TextInput
              label={t("pages.formButtonLabel")}
              value={block.buttonLabel}
              max={60}
              onChange={(buttonLabel) => onChange({ ...block, buttonLabel })}
            />
          </div>
          <p className="text-sm text-muted-foreground">{t("pages.formNote")}</p>
        </div>
      );
  }
}

function TextInput({
  label,
  hint,
  value,
  max,
  inputMode,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  max: number;
  inputMode?: "url" | "tel";
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      {(props) => (
        <Input
          {...props}
          value={value}
          maxLength={max}
          inputMode={inputMode}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}

function TextArea({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: string;
  max: number;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      {(props) => (
        <textarea
          {...props}
          rows={3}
          maxLength={max}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
        />
      )}
    </Field>
  );
}

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm">
      <input
        type="checkbox"
        className="size-5 accent-primary"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function IllustrationSelect({
  label,
  value,
  allowNone = false,
  onChange,
}: {
  label: string;
  value: StoreIllustrationId | "";
  allowNone?: boolean;
  onChange: (value: StoreIllustrationId | "") => void;
}) {
  const t = useT();
  return (
    <Field label={label}>
      {(props) => (
        <select
          {...props}
          className={selectClass}
          value={value}
          onChange={(event) => onChange(event.target.value as StoreIllustrationId | "")}
        >
          {allowNone ? <option value="">{t("pages.illustrationNone")}</option> : null}
          {storeIllustrationIds.map((id) => (
            <option key={id} value={id}>
              {t(illustrationKeys[id])}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

function ImageUpload({
  label,
  hint,
  onFile,
  uploading,
  uploadFailed,
}: {
  label: string;
  hint?: string;
  onFile: (file: File) => void;
  uploading: boolean;
  uploadFailed: boolean;
}) {
  const t = useT();
  return (
    <>
      <Field label={label} hint={hint}>
        {(props) => (
          <Input
            {...props}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="h-auto py-2"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFile(file);
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
    </>
  );
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
