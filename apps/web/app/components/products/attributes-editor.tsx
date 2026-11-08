import {
  ATTRIBUTE_VALUES_MAX,
  attributeValuesOf,
  PRODUCT_ATTRIBUTES_MAX,
  type ProductAttribute,
  priceIsValid,
  stockIsValid,
  VARIATION_ATTRIBUTES_MAX,
  type VariantDraft,
  variantKey,
} from "@monaztore/contracts";
import { PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useT } from "~/lib/i18n";
import { cn } from "~/lib/utils";

/**
 * Attributes (Talla, Color, Material) with their values. Those the shopper picks make the
 * variants; the rest describe the product. Every attribute is also a filter in the catalog.
 */
export function AttributesEditor({
  attributes,
  suggestions,
  onChange,
  disabled,
}: {
  attributes: ProductAttribute[];
  suggestions: { name: string; values: string[] }[];
  onChange: (attributes: ProductAttribute[]) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const listId = useId();
  const variationCount = attributes.filter((a) => a.variation).length;
  const update = (index: number, change: Partial<ProductAttribute>) =>
    onChange(attributes.map((a, i) => (i === index ? { ...a, ...change } : a)));

  return (
    <div className="grid gap-3">
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s.name} value={s.name} />
        ))}
      </datalist>
      {attributes.map((attribute, index) => (
        <AttributeCard
          // biome-ignore lint/suspicious/noArrayIndexKey: attributes have no id; the name is being typed.
          key={index}
          attribute={attribute}
          listId={listId}
          known={
            suggestions.find((s) => s.name.toLowerCase() === attribute.name.toLowerCase())
              ?.values ?? []
          }
          canPick={attribute.variation || variationCount < VARIATION_ATTRIBUTES_MAX}
          disabled={disabled}
          onChange={(change) => update(index, change)}
          onRemove={() => onChange(attributes.filter((_, i) => i !== index))}
        />
      ))}
      {attributes.length < PRODUCT_ATTRIBUTES_MAX ? (
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() =>
            onChange([
              ...attributes,
              { name: "", values: [], variation: variationCount < VARIATION_ATTRIBUTES_MAX },
            ])
          }
        >
          <PlusIcon aria-hidden className="size-4" />
          {t("products.addAttribute")}
        </Button>
      ) : null}
    </div>
  );
}

function AttributeCard({
  attribute,
  listId,
  known,
  canPick,
  disabled,
  onChange,
  onRemove,
}: {
  attribute: ProductAttribute;
  listId: string;
  known: string[];
  canPick: boolean;
  disabled?: boolean;
  onChange: (change: Partial<ProductAttribute>) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const id = useId();
  const [draft, setDraft] = useState("");
  const addValues = (text: string) => {
    const values = attributeValuesOf([...attribute.values, ...attributeValuesOf(text)].join(","));
    onChange({ values: values.slice(0, ATTRIBUTE_VALUES_MAX) });
    setDraft("");
  };
  const unused = known.filter((value) => !attribute.values.includes(value)).slice(0, 12);
  const label = attribute.name || t("products.attributeUnnamed");

  return (
    <fieldset className="grid gap-3 rounded-md border p-3">
      <legend className="sr-only">{label}</legend>
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <div className="grid gap-2">
          <Label htmlFor={`${id}-name`}>{t("products.attributeName")}</Label>
          <Input
            id={`${id}-name`}
            list={listId}
            value={attribute.name}
            maxLength={60}
            placeholder={t("products.attributeNamePlaceholder")}
            disabled={disabled}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={onRemove}
          aria-label={t("products.removeAttribute", { name: label })}
        >
          <Trash2Icon aria-hidden className="size-4" />
        </Button>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-value`}>{t("products.attributeValues")}</Label>
        {attribute.values.length > 0 ? (
          <ul className="flex flex-wrap gap-1" aria-label={t("products.valuesOf", { name: label })}>
            {attribute.values.map((value) => (
              <li key={value}>
                <span className="inline-flex min-h-9 items-center gap-1 rounded-full border bg-muted pl-3 text-sm">
                  {value}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      onChange({ values: attribute.values.filter((v) => v !== value) })
                    }
                    className="grid size-9 place-items-center rounded-full outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    aria-label={t("products.removeValue", { value })}
                  >
                    <XIcon aria-hidden className="size-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex gap-2">
          <Input
            id={`${id}-value`}
            value={draft}
            disabled={disabled}
            placeholder={t("products.attributeValuesPlaceholder")}
            aria-describedby={`${id}-value-hint`}
            onChange={(event) => {
              if (/[,\n]/.test(event.target.value)) addValues(event.target.value);
              else setDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addValues(draft);
              }
            }}
            onBlur={() => draft.trim() && addValues(draft)}
          />
          <Button
            type="button"
            variant="outline"
            disabled={disabled || !draft.trim()}
            onClick={() => addValues(draft)}
          >
            {t("products.addValue")}
          </Button>
        </div>
        <p id={`${id}-value-hint`} className="text-sm text-muted-foreground">
          {t("products.attributeValuesHint")}
        </p>
        {unused.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-sm text-muted-foreground">{t("products.usedBefore")}</span>
            {unused.map((value) => (
              <Button
                key={value}
                type="button"
                variant="outline"
                className="h-9 rounded-full px-3"
                disabled={disabled}
                onClick={() => addValues(value)}
              >
                + {value}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
      <label className={cn("flex min-h-11 items-start gap-3 text-sm", !canPick && "opacity-60")}>
        <input
          type="checkbox"
          className="mt-0.5 size-5 shrink-0 accent-primary"
          checked={attribute.variation}
          disabled={disabled || !canPick}
          onChange={(event) => onChange({ variation: event.target.checked })}
        />
        <span className="grid gap-0.5">
          <span className="font-medium">{t("products.attributeVariation")}</span>
          <span className="text-muted-foreground">
            {canPick
              ? t("products.attributeVariationHint")
              : t("products.attributeVariationMax", { max: VARIATION_ATTRIBUTES_MAX })}
          </span>
        </span>
      </label>
    </fieldset>
  );
}

/**
 * One row per combination ("M / Rojo"): its own price and offer (empty takes the product's),
 * SKU, stock or availability and photo. "Same for all" fills every row at once.
 */
export function VariantsEditor({
  variants,
  photos,
  trackStock,
  currency,
  missing,
  onChange,
  onAddMissing,
  disabled,
}: {
  variants: VariantDraft[];
  photos: { url: string }[];
  trackStock: boolean;
  currency: string;
  missing: number;
  onChange: (variants: VariantDraft[]) => void;
  onAddMissing: () => void;
  disabled?: boolean;
}) {
  const t = useT();
  const id = useId();
  const [all, setAll] = useState({ price: "", offerPrice: "", stock: "" });
  const update = (index: number, change: Partial<VariantDraft>) =>
    onChange(variants.map((v, i) => (i === index ? { ...v, ...change } : v)));
  const titleOf = (variant: VariantDraft) =>
    Object.values(variant.options).join(" / ") || t("products.anyOption");

  return (
    <div className="grid gap-3">
      <details className="rounded-md border p-3">
        <summary className="min-h-11 cursor-pointer content-center font-medium">
          {t("products.sameForAll")}
        </summary>
        <div className="grid gap-3 pt-2 sm:grid-cols-3">
          <SmallField
            id={`${id}-all-price`}
            label={t("products.priceLabel", { currency })}
            value={all.price}
            onChange={(price) => setAll({ ...all, price })}
            inputMode="decimal"
          />
          <SmallField
            id={`${id}-all-offer`}
            label={t("products.offerPriceLabel", { currency })}
            value={all.offerPrice}
            onChange={(offerPrice) => setAll({ ...all, offerPrice })}
            inputMode="decimal"
          />
          {trackStock ? (
            <SmallField
              id={`${id}-all-stock`}
              label={t("products.stockLabel")}
              value={all.stock}
              onChange={(stock) => setAll({ ...all, stock })}
              inputMode="numeric"
            />
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="sm:col-span-3"
            disabled={disabled}
            onClick={() =>
              onChange(
                variants.map((v) => ({
                  ...v,
                  ...(all.price.trim() ? { price: all.price } : {}),
                  ...(all.offerPrice.trim() ? { offerPrice: all.offerPrice } : {}),
                  ...(trackStock && all.stock.trim() ? { stock: all.stock } : {}),
                })),
              )
            }
          >
            {t("products.applyToAll", { count: variants.length })}
          </Button>
        </div>
      </details>
      <ul className="grid gap-2">
        {variants.map((variant, index) => {
          const rowId = `${id}-${index}`;
          const title = titleOf(variant);
          return (
            <li key={variantKey(variant.options)} className="grid gap-3 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-medium">{title}</h4>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled}
                  onClick={() => onChange(variants.filter((_, i) => i !== index))}
                  aria-label={t("products.removeVariant", { name: title })}
                >
                  <Trash2Icon aria-hidden className="size-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SmallField
                  id={`${rowId}-price`}
                  label={t("products.priceLabel", { currency })}
                  placeholder={t("products.sameAsProduct")}
                  value={variant.price}
                  invalid={!priceIsValid(variant.price)}
                  onChange={(price) => update(index, { price })}
                  inputMode="decimal"
                  disabled={disabled}
                />
                <SmallField
                  id={`${rowId}-offer`}
                  label={t("products.offerPriceLabel", { currency })}
                  value={variant.offerPrice}
                  invalid={!priceIsValid(variant.offerPrice)}
                  onChange={(offerPrice) => update(index, { offerPrice })}
                  inputMode="decimal"
                  disabled={disabled}
                />
                <SmallField
                  id={`${rowId}-sku`}
                  label={t("products.skuLabel")}
                  value={variant.sku}
                  onChange={(sku) => update(index, { sku })}
                  disabled={disabled}
                />
                {trackStock ? (
                  <SmallField
                    id={`${rowId}-stock`}
                    label={t("products.stockLabel")}
                    value={variant.stock}
                    invalid={!stockIsValid(variant.stock)}
                    onChange={(stock) => update(index, { stock })}
                    inputMode="numeric"
                    disabled={disabled}
                  />
                ) : (
                  <label className="flex min-h-11 items-center gap-2 self-end text-sm">
                    <input
                      type="checkbox"
                      className="size-5 accent-primary"
                      checked={variant.inStock}
                      disabled={disabled}
                      onChange={(event) => update(index, { inStock: event.target.checked })}
                    />
                    {t("products.variantAvailable")}
                  </label>
                )}
              </div>
              {photos.length > 0 ? (
                <fieldset className="grid gap-2">
                  <legend className="mb-1 text-sm font-medium">{t("products.variantPhoto")}</legend>
                  <div className="flex flex-wrap gap-2">
                    {[{ url: "" }, ...photos].map((photo, photoIndex) => (
                      <label
                        key={photo.url || "none"}
                        className={cn(
                          "grid size-11 cursor-pointer place-items-center overflow-hidden rounded-md border text-xs has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                          variant.imageUrl === photo.url && "ring-2 ring-primary",
                        )}
                      >
                        <input
                          type="radio"
                          name={`${rowId}-photo`}
                          className="sr-only"
                          checked={variant.imageUrl === photo.url}
                          disabled={disabled}
                          onChange={() => update(index, { imageUrl: photo.url })}
                        />
                        {photo.url ? (
                          <img
                            src={photo.url}
                            alt={t("products.photoNumber", { number: photoIndex })}
                            className="size-full object-cover"
                          />
                        ) : (
                          <span>{t("products.noPhoto")}</span>
                        )}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
            </li>
          );
        })}
      </ul>
      {missing > 0 ? (
        <Button type="button" variant="outline" disabled={disabled} onClick={onAddMissing}>
          <PlusIcon aria-hidden className="size-4" />
          {t("products.addMissing", { count: missing })}
        </Button>
      ) : null}
    </div>
  );
}

function SmallField({
  id,
  label,
  value,
  onChange,
  invalid,
  ...props
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  placeholder?: string;
  inputMode?: "decimal" | "numeric";
  disabled?: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value)}
        {...props}
      />
    </div>
  );
}
