import {
  getFormProps,
  getInputProps,
  getSelectProps,
  getTextareaProps,
  useForm,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  categoryFormSchema,
  dayOf,
  formPricesOf,
  minorToPrice,
  type ProductAttribute,
  percentOff,
  priceToMinor,
  productFormSchema,
  productInputOf,
  syncVariants,
  type VariantDraft,
  variantCombinations,
  variantKey,
} from "@monaztore/contracts";
import {
  bulkUpdateProducts,
  catalogSettings,
  createCategory,
  DomainError,
  duplicateProduct,
  type EditableProduct,
  getEditableProduct,
  listAttributeNames,
  listCategories,
  listStoreDomains,
  NotFoundError,
  saveProduct,
} from "@monaztore/core";
import { ArrowLeftIcon, CopyIcon, DownloadIcon, ExternalLinkIcon, Trash2Icon } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useId, useState } from "react";
import { data, Form, href, Link, redirect, useFetcher, useSearchParams } from "react-router";
import { PageHeader } from "~/components/page-header";
import { RichText } from "~/components/pages/block-editor";
import { AttributesEditor, VariantsEditor } from "~/components/products/attributes-editor";
import { ProductPhotos } from "~/components/products/product-photos";
import { FieldErrors, TextField } from "~/components/text-field";
import { Button, buttonVariants } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { tenantContext } from "~/context";
import { metaT, useLocale, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { formatPrice } from "~/lib/money";
import { storeOrigin } from "~/lib/store-seo";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/product";

/** The form, the side panel (visibility, collections) and the save bar need the width. */
export const handle = { wide: true };

export function meta({ matches, loaderData }: Route.MetaArgs) {
  const t = metaT(matches);
  return [{ title: loaderData?.product ? loaderData.product.name : t("products.newTitle") }];
}

const isNew = (productId: string) => productId === "new";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const tenant = context.get(tenantContext);
  const product = isNew(params.productId)
    ? null
    : await getEditableProduct(tenant, params.productId);
  if (!isNew(params.productId) && !product) throw data("Product not found", { status: 404 });
  const [categories, attributeNames, settings, domains] = await Promise.all([
    listCategories(tenant),
    listAttributeNames(tenant),
    catalogSettings(tenant),
    listStoreDomains(tenant),
  ]);
  const primary = domains.find((domain) => domain.primary) ?? domains[0];
  return {
    product,
    categories,
    attributeNames,
    currency: settings.currency,
    timeZone: settings.timeZone,
    storeUrl: primary ? storeOrigin(primary.hostname, request.url) : null,
    owner: tenant.role === "owner",
    i18n: translations(context, "products", "forms", "pages"),
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const tenant = context.get(tenantContext);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "save");

  if (intent === "category") {
    const submission = parseWithZod(formData, { schema: categoryFormSchema });
    if (submission.status !== "success") {
      return data({ intent, category: null, result: submission.reply() }, { status: 400 });
    }
    const category = await createCategory(tenant, submission.value);
    return { intent, category, result: submission.reply({ resetForm: true }) };
  }
  if (intent === "duplicate" && !isNew(params.productId)) {
    const copy = await duplicateProduct(tenant, params.productId);
    throw redirect(
      `${href("/app/:workspace/products/:productId", { workspace: params.workspace, productId: copy })}?copied`,
    );
  }
  if (intent === "delete" && !isNew(params.productId)) {
    await bulkUpdateProducts(tenant, { action: "delete", ids: [params.productId] });
    throw redirect(href("/app/:workspace/products", { workspace: params.workspace }));
  }

  const submission = parseWithZod(formData, { schema: productFormSchema });
  if (submission.status !== "success") {
    return data({ intent, category: null, result: submission.reply() }, { status: 400 });
  }
  try {
    const id = await saveProduct(
      tenant,
      isNew(params.productId) ? null : params.productId,
      productInputOf(submission.value),
    );
    if (isNew(params.productId)) {
      throw redirect(
        `${href("/app/:workspace/products/:productId", { workspace: params.workspace, productId: id })}?created`,
      );
    }
    return { intent, category: null, result: submission.reply(), saved: true };
  } catch (error) {
    if (error instanceof NotFoundError) throw data("Product not found", { status: 404 });
    if (!(error instanceof DomainError)) throw error;
    const errors: Record<string, [string, string]> = {
      slug_taken: ["slug", "forms.productSlugTaken"],
      sku_taken: ["sku", "forms.skuTaken"],
      image_invalid: ["images", "forms.imagesInvalid"],
      variants_invalid: ["variants", "forms.variantsInvalid"],
    };
    const [field, key] = errors[error.code] ?? ["name", "forms.productNotSaved"];
    return data(
      {
        intent,
        category: null,
        result: submission.reply({ fieldErrors: { [field]: [key] } }),
        sku: error.code === "sku_taken" ? error.message : null,
      },
      { status: 400 },
    );
  }
}

const draftOf = (variant: EditableProduct["variants"][number]): VariantDraft => {
  const { regular, offer } = formPricesOf(variant.price, variant.compareAtPrice);
  return {
    id: variant.id,
    options: variant.options,
    sku: variant.sku ?? "",
    price: regular === null ? "" : minorToPrice(regular),
    offerPrice: offer === null ? "" : minorToPrice(offer),
    stock: variant.stockQuantity === null ? "" : String(variant.stockQuantity),
    inStock: variant.inStock,
    imageUrl: variant.imageUrl ?? "",
  };
};

export default function ProductEditor({ loaderData, params }: Route.ComponentProps) {
  const t = useT();
  const locale = useLocale();
  const [search] = useSearchParams();
  const { product, categories, attributeNames, currency, timeZone, storeUrl, owner } = loaderData;
  const save = useFetcher<typeof action>({ key: `product-${params.productId}` });
  const lastResult = save.state === "idle" ? save.data?.result : undefined;
  const prices = formPricesOf(product?.price ?? null, product?.compareAtPrice ?? null);
  const tracked = product
    ? product.stockQuantity !== null || product.variants.some((v) => v.stockQuantity !== null)
    : false;

  const [form, fields] = useForm({
    id: `product-${params.productId}`,
    lastResult,
    defaultValue: {
      name: product?.name ?? "",
      slug: product?.slug ?? "",
      shortDescription: product?.shortDescription ?? "",
      regularPrice: prices.regular === null ? "" : minorToPrice(prices.regular),
      offerPrice: prices.offer === null ? "" : minorToPrice(prices.offer),
      saleFrom: product?.saleStartsAt ? dayOf(new Date(product.saleStartsAt), timeZone) : "",
      saleTo: product?.saleEndsAt
        ? dayOf(new Date(product.saleEndsAt), timeZone, { endOfDay: true })
        : "",
      sku: product?.sku ?? "",
      trackStock: tracked ? "on" : "",
      stock: product?.stockQuantity == null ? "" : String(product.stockQuantity),
      available: product?.inStock === false ? "no" : "yes",
      weight: product?.weightGrams == null ? "" : String(product.weightGrams),
      seoTitle: product?.seoTitle ?? "",
      seoDescription: product?.seoDescription ?? "",
      categoryIds: product?.categoryIds ?? [],
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: productFormSchema }),
  });

  const [description, setDescription] = useState(product?.description ?? "");
  const [photos, setPhotos] = useState(product?.images ?? []);
  const [attributes, setAttributes] = useState<ProductAttribute[]>(product?.attributes ?? []);
  const [variants, setVariants] = useState<VariantDraft[]>(() =>
    (product?.variants ?? []).map(draftOf),
  );
  const [dirty, setDirty] = useState(false);
  const changed =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setDirty(true);
    };
  const changePhotos = useCallback((next: { url: string; alt: string }[]) => {
    setPhotos(next);
    setDirty(true);
    // A variant whose photo left the product goes without one.
    setVariants((current) =>
      current.map((v) =>
        v.imageUrl && !next.some((p) => p.url === v.imageUrl) ? { ...v, imageUrl: "" } : v,
      ),
    );
  }, []);
  const changeAttributes = (next: ProductAttribute[]) => {
    setVariants((current) => syncVariants(attributes, next, current));
    setAttributes(next);
    setDirty(true);
  };
  const combinations = variantCombinations(attributes);
  const have = new Set(variants.map((v) => variantKey(v.options)));
  const missing = combinations.filter((options) => !have.has(variantKey(options)));

  const trackStock = fields.trackStock.value === "on";
  const hasVariants = variants.length > 0;
  const saving = save.state !== "idle";
  const saved = save.state === "idle" && save.data && "saved" in save.data && save.data.saved;
  const slug = fields.slug.value || product?.slug || "";
  const productUrl = storeUrl && slug ? `${storeUrl}${href("/products/:slug", { slug })}` : null;
  const status = product?.status ?? "draft";
  const regular = priceToMinor(fields.regularPrice.value ?? "");
  const offer = priceToMinor(fields.offerPrice.value ?? "");

  // A product that was just made or copied says so once.
  const notice = search.has("created")
    ? t("products.created")
    : search.has("copied")
      ? t("products.copied")
      : null;

  return (
    <>
      <Link
        to={href("/app/:workspace/products", { workspace: params.workspace })}
        className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        <ArrowLeftIcon aria-hidden className="size-4" />
        {t("products.back")}
      </Link>
      <PageHeader title={product ? product.name : t("products.newTitle")}>
        {product?.status === "active" && productUrl ? (
          <a
            href={productUrl}
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-11 items-center gap-1 underline underline-offset-4"
          >
            {t("products.viewInStore")}
            <ExternalLinkIcon aria-hidden className="size-4" />
          </a>
        ) : null}
      </PageHeader>
      {notice ? (
        <p role="status" className="mb-4 rounded-md border p-3 text-sm">
          {notice}
        </p>
      ) : null}

      <save.Form
        method="post"
        {...getFormProps(form)}
        onChange={() => setDirty(true)}
        className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start"
      >
        <input type="hidden" name="timeZone" value={timeZone} />
        <input type="hidden" name="description" value={description} />
        <input
          type="hidden"
          id={fields.images.id}
          name={fields.images.name}
          value={JSON.stringify(photos)}
        />
        <input
          type="hidden"
          id={fields.attributes.id}
          name={fields.attributes.name}
          value={JSON.stringify(attributes.filter((a) => a.name.trim() && a.values.length))}
        />
        <input
          type="hidden"
          id={fields.variants.id}
          name={fields.variants.name}
          value={JSON.stringify(variants)}
        />

        <div className="grid min-w-0 gap-6">
          <Section title={t("products.basicsHeading")}>
            <TextField field={fields.name} label={t("products.nameLabel")} autoComplete="off" />
            <RichText
              html={description}
              onChange={changed(setDescription)}
              label={t("products.descriptionLabel")}
            />
            <div className="grid gap-2">
              <Label htmlFor={fields.shortDescription.id}>
                {t("products.shortDescriptionLabel")}
              </Label>
              <textarea
                {...getTextareaProps(fields.shortDescription, {
                  ariaDescribedBy: `${fields.shortDescription.id}-hint`,
                })}
                key={fields.shortDescription.key}
                rows={2}
                className="rounded-md border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
              />
              <p
                id={`${fields.shortDescription.id}-hint`}
                className="text-sm text-muted-foreground"
              >
                {t("products.shortDescriptionHint")}
              </p>
              <FieldErrors
                id={fields.shortDescription.errorId}
                errors={fields.shortDescription.errors}
              />
            </div>
          </Section>

          <Section title={t("products.photosHeading")}>
            <ProductPhotos workspace={params.workspace} photos={photos} onChange={changePhotos} />
            <FieldErrors id={fields.images.errorId} errors={fields.images.errors} />
          </Section>

          <Section
            title={t("products.priceHeading")}
            description={hasVariants ? t("products.priceVariantsHint") : undefined}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                field={fields.regularPrice}
                label={t("products.priceLabel", { currency })}
                inputMode="decimal"
                description={t("products.priceHint")}
              />
              <TextField
                field={fields.offerPrice}
                label={t("products.offerPriceLabel", { currency })}
                inputMode="decimal"
                description={
                  regular && offer && offer < regular
                    ? t("products.offerSummary", {
                        percent: percentOff(regular, offer),
                        price: formatPrice(offer, currency, locale),
                      })
                    : t("products.offerHint")
                }
              />
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">{t("products.offerDates")}</legend>
              <div className="grid grid-cols-2 gap-4">
                <TextField field={fields.saleFrom} type="date" label={t("products.offerFrom")} />
                <TextField field={fields.saleTo} type="date" label={t("products.offerTo")} />
              </div>
              <p className="text-sm text-muted-foreground">{t("products.offerDatesHint")}</p>
            </fieldset>
          </Section>

          <Section title={t("products.inventoryHeading")}>
            <TextField
              field={fields.sku}
              label={t("products.skuLabel")}
              description={t("products.skuHint")}
              autoCapitalize="characters"
            />
            {save.data && "sku" in save.data && save.data.sku ? (
              <p className="-mt-2 text-sm text-destructive">
                {t("products.skuTakenDetail", { sku: String(save.data.sku) })}
              </p>
            ) : null}
            <label className="flex min-h-11 items-start gap-3 text-sm">
              <input
                {...getInputProps(fields.trackStock, { type: "checkbox" })}
                key={fields.trackStock.key}
                className="mt-0.5 size-5 shrink-0 accent-primary"
              />
              <span className="grid gap-0.5">
                <span className="font-medium">{t("products.trackStock")}</span>
                <span className="text-muted-foreground">{t("products.trackStockHint")}</span>
              </span>
            </label>
            {hasVariants ? (
              <p className="text-sm text-muted-foreground">{t("products.stockInVariants")}</p>
            ) : trackStock ? (
              <TextField
                field={fields.stock}
                label={t("products.stockLabel")}
                inputMode="numeric"
                className="max-w-48"
              />
            ) : (
              <div className="grid max-w-64 gap-2">
                <Label htmlFor={fields.available.id}>{t("products.availability")}</Label>
                <select
                  {...getSelectProps(fields.available)}
                  key={fields.available.key}
                  className="h-11 rounded-md border bg-background px-3"
                >
                  <option value="yes">{t("products.available")}</option>
                  <option value="no">{t("products.soldOut")}</option>
                </select>
              </div>
            )}
            <TextField
              field={fields.weight}
              label={t("products.weightLabel")}
              inputMode="numeric"
              description={t("products.weightHint")}
              className="max-w-48"
            />
          </Section>

          <Section
            title={t("products.attributesHeading")}
            description={t("products.attributesIntro")}
          >
            <AttributesEditor
              attributes={attributes}
              suggestions={attributeNames}
              onChange={changeAttributes}
            />
            <FieldErrors id={fields.attributes.errorId} errors={fields.attributes.errors} />
            {combinations.length > 0 || variants.length > 0 ? (
              <div className="grid gap-3">
                <h3 className="font-semibold">
                  {t("products.variantsHeading", { count: variants.length })}
                </h3>
                <p className="text-sm text-muted-foreground">{t("products.variantsIntro")}</p>
                <VariantsEditor
                  variants={variants}
                  photos={photos}
                  trackStock={trackStock}
                  currency={currency}
                  missing={missing.length}
                  onChange={changed(setVariants)}
                  onAddMissing={() =>
                    changed(setVariants)([
                      ...variants,
                      ...missing.map((options) => ({
                        options,
                        sku: "",
                        price: "",
                        offerPrice: "",
                        stock: "",
                        inStock: true,
                        imageUrl: "",
                      })),
                    ])
                  }
                />
                <FieldErrors id={fields.variants.errorId} errors={fields.variants.errors} />
              </div>
            ) : null}
          </Section>

          <Section title={t("products.seoHeading")} description={t("products.seoIntro")}>
            <TextField
              field={fields.slug}
              label={t("products.slugLabel")}
              autoCapitalize="none"
              description={
                storeUrl
                  ? t("products.slugHint", { url: `${storeUrl}/products/${slug || "…"}` })
                  : undefined
              }
            />
            <TextField
              field={fields.seoTitle}
              label={t("products.seoTitleLabel")}
              description={t("products.charactersLeft", {
                count: 70 - (fields.seoTitle.value ?? "").length,
              })}
            />
            <TextField
              field={fields.seoDescription}
              label={t("products.seoDescriptionLabel")}
              description={t("products.charactersLeft", {
                count: 160 - (fields.seoDescription.value ?? "").length,
              })}
            />
            <figure
              className="grid gap-1 rounded-md border p-3"
              aria-label={t("products.searchPreview")}
            >
              <figcaption className="text-xs font-medium text-muted-foreground uppercase">
                {t("products.searchPreview")}
              </figcaption>
              <p className="truncate text-sm text-muted-foreground">
                {productUrl ?? `/products/${slug}`}
              </p>
              <p className="text-lg leading-snug text-primary">
                {fields.seoTitle.value || fields.name.value || t("products.newTitle")}
              </p>
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {fields.seoDescription.value ||
                  fields.shortDescription.value ||
                  t("products.seoDescriptionEmpty")}
              </p>
            </figure>
          </Section>
        </div>

        <div className="grid min-w-0 gap-6">
          <Section title={t("products.visibilityHeading")}>
            <p className="text-sm">
              {status === "active"
                ? t("products.visibilityActive")
                : status === "archived"
                  ? t("products.visibilityArchived")
                  : t("products.visibilityDraft")}
            </p>
            {product ? (
              <div className="flex flex-wrap gap-2 border-t pt-3">
                <Button
                  type="submit"
                  form={PRODUCT_ACTIONS}
                  name="intent"
                  value="duplicate"
                  variant="outline"
                  className="flex-1"
                >
                  <CopyIcon aria-hidden className="size-4" />
                  {t("products.duplicate")}
                </Button>
                <Button
                  type="submit"
                  form={PRODUCT_ACTIONS}
                  name="intent"
                  value="delete"
                  variant="ghost"
                  className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={(event) => {
                    if (!window.confirm(t("products.deleteOneConfirm", { name: product.name })))
                      event.preventDefault();
                  }}
                >
                  <Trash2Icon aria-hidden className="size-4" />
                  {t("products.deleteProduct")}
                </Button>
              </div>
            ) : null}
          </Section>
          <CollectionsPicker
            categories={categories}
            selected={fields.categoryIds.initialValue as string[] | undefined}
            name={fields.categoryIds.name}
            created={save.data?.intent === "category" ? save.data.category : null}
          />
          <Section title={t("products.downloadHeading")}>
            {product && product.files > 0 ? (
              <p className="text-sm">{t("products.downloadFiles", { count: product.files })}</p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("products.downloadIntro")}</p>
            )}
            {product && owner ? (
              <Link
                to={href("/app/:workspace/downloads/:productId", {
                  workspace: params.workspace,
                  productId: product.id,
                })}
                className={buttonVariants({ variant: "outline" })}
              >
                <DownloadIcon aria-hidden className="size-4" />
                {product.files > 0 ? t("products.manageFiles") : t("products.addFile")}
              </Link>
            ) : !product ? (
              <p className="text-sm text-muted-foreground">{t("products.downloadAfterSave")}</p>
            ) : null}
          </Section>
        </div>

        {/* The save bar: on the phone above the menu bar, in reach of the thumb; from 768 px a
            floating bar under the editor, with what changed on the left and the buttons on the right. */}
        <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex items-center gap-3 border-t bg-background px-4 py-3 shadow-[0_-4px_16px_rgb(0_0_0/0.08)] md:bottom-4 md:mx-0 md:rounded-lg md:border lg:col-span-2">
          <p
            role="status"
            className="sr-only text-sm text-muted-foreground sm:not-sr-only sm:min-w-0 sm:flex-1 sm:truncate"
          >
            {saving
              ? t("products.saving")
              : saved && !dirty
                ? t("products.saved")
                : dirty
                  ? t("products.unsaved")
                  : ""}
          </p>
          <div className="flex flex-1 gap-2 sm:flex-none">
            <Button
              type="submit"
              name={fields.status.name}
              value={status === "archived" ? "archived" : "draft"}
              variant="outline"
              disabled={saving}
              onClick={() => setDirty(false)}
              className="flex-1 sm:flex-none"
            >
              {status === "active"
                ? t("products.unpublish")
                : status === "archived"
                  ? t("products.keepHidden")
                  : t("products.saveDraft")}
            </Button>
            <Button
              type="submit"
              name={fields.status.name}
              value="active"
              disabled={saving}
              onClick={() => setDirty(false)}
              className="flex-1 sm:flex-none"
            >
              {status === "active" ? t("products.saveChanges") : t("products.publish")}
            </Button>
          </div>
        </div>
      </save.Form>
      <NewCollectionForm />

      {/* Duplicate and delete live in "Who sees it", outside the editor's form. */}
      {product ? <Form method="post" id={PRODUCT_ACTIONS} hidden /> : null}
    </>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid gap-4 rounded-lg border p-4">
      <div className="grid gap-1">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** The form for Duplicate and Delete, whose buttons sit inside the editor. */
const PRODUCT_ACTIONS = "product-actions";

const NEW_COLLECTION = "new-collection";

/** The new collection's own form, outside the product's (forms can't nest): its field points to it. */
function NewCollectionForm() {
  const add = useFetcher<typeof action>({ key: NEW_COLLECTION });
  return (
    <add.Form id={NEW_COLLECTION} method="post" className="hidden">
      <input type="hidden" name="intent" value="category" />
    </add.Form>
  );
}

/**
 * The collections the product is in, as checkboxes (children under their parent), and a new
 * one right there: it comes back checked.
 */
function CollectionsPicker({
  categories,
  selected,
  name,
  created,
}: {
  categories: { id: string; name: string; parentId: string | null }[];
  selected: string[] | undefined;
  name: string;
  created: { id: string; name: string } | null | undefined;
}) {
  const t = useT();
  const id = useId();
  const add = useFetcher<typeof action>({ key: NEW_COLLECTION });
  const [fresh, setFresh] = useState<string[]>([]);
  const madeNow =
    add.state === "idle" && add.data?.intent === "category" ? add.data.category : (created ?? null);
  useEffect(() => {
    const made = madeNow?.id;
    if (made) setFresh((ids) => (ids.includes(made) ? ids : [...ids, made]));
  }, [madeNow?.id]);
  const checked = new Set([...(selected ?? []), ...fresh]);
  const depth = (category: { parentId: string | null }) => (category.parentId ? 1 : 0);

  return (
    <section aria-labelledby={id} className="grid gap-3 rounded-lg border p-4">
      <h2 id={id} className="text-lg font-semibold">
        {t("products.collectionsHeading")}
      </h2>
      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("products.noCollections")}</p>
      ) : null}
      <ul className="grid max-h-72 gap-1 overflow-y-auto">
        {categories.map((category) => (
          <li key={category.id} className={cn(depth(category) && "pl-6")}>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                name={name}
                value={category.id}
                defaultChecked={checked.has(category.id)}
                className="size-5 accent-primary"
              />
              {category.name}
            </label>
          </li>
        ))}
      </ul>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-new`}>{t("products.newCollection")}</Label>
        <div className="flex gap-2">
          <Input
            id={`${id}-new`}
            form={NEW_COLLECTION}
            name="name"
            maxLength={80}
            placeholder={t("products.newCollectionPlaceholder")}
          />
          <Button
            type="submit"
            form={NEW_COLLECTION}
            variant="outline"
            disabled={add.state !== "idle"}
          >
            {t("products.addCollection")}
          </Button>
        </div>
        <FieldErrors
          id={`${id}-errors`}
          errors={
            add.data?.intent === "category" && !add.data.category
              ? (add.data.result?.error?.name as string[] | undefined)
              : undefined
          }
        />
      </div>
    </section>
  );
}
