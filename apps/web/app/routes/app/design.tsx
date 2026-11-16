import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  FOOTER_MENU_MAX,
  normalizeHex,
  STORE_MENU_MAX,
  STORE_SUBMENU_MAX,
  type StoreThemeId,
  storeThemeIds,
  storeThemeSchema,
} from "@monaztore/contracts";
import { storeIllustrationIds } from "@monaztore/contracts/illustrations";
import {
  getThemeSettings,
  getWorkspace,
  listCategories,
  listPages,
  listStoreDomains,
  listStoreOptionNames,
  optionFilterKey,
  updateStoreTheme,
} from "@monaztore/core";
import { paletteOf, storeThemes, type ThemePalette } from "@monaztore/core/themes";
import { ArrowDownIcon, ArrowUpIcon, MoonIcon, PlusIcon, SunIcon, Trash2Icon } from "lucide-react";
import { useId, useState } from "react";
import { data, Form, href, Link, useNavigation } from "react-router";
import { PageHeader } from "~/components/page-header";
import { illustrationKeys } from "~/components/pages/illustration-options";
import { ThemePreview } from "~/components/storefront/theme-preview";
import { FieldErrors, TextField } from "~/components/text-field";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { tenantContext } from "~/context";
import { metaT, useT } from "~/lib/i18n";
import { serverT, translations } from "~/lib/locale.server";
import { uploadStoreImage } from "~/lib/page-images.server";
import { storeOrigin } from "~/lib/store-seo";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/design";

/** The form and its preview side by side need more than a list's width. */
export const handle = { wide: true };

const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("design.title") }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = context.get(tenantContext);
  const [settings, domains, workspace, optionNames, pages, categories] = await Promise.all([
    getThemeSettings(tenant),
    listStoreDomains(tenant),
    getWorkspace(tenant),
    listStoreOptionNames(tenant),
    listPages(tenant),
    listCategories(tenant),
  ]);
  const t = serverT(context);
  const primary = domains.find((domain) => domain.primary) ?? domains[0];
  return {
    settings,
    // The catalog's filters the owner can turn off: price, availability and each option.
    filters: [
      ...optionNames.map((name) => ({ key: optionFilterKey(name), name })),
      { key: "price", name: null },
      { key: "availability", name: null },
    ],
    // What a menu link can point to, picked instead of typed.
    linkOptions: [
      { label: t("storefront.allProducts"), href: "/products" },
      { label: t("storefront.allCategories"), href: "/collections" },
      ...pages
        .filter((page) => page.status === "published" && !page.isHome)
        .map((page) => ({ label: page.title, href: `/${page.slug}` })),
      ...categories.map((category) => ({
        label: category.name,
        href: `/collections/${category.slug}`,
      })),
    ],
    workspaceName: workspace.name,
    storeUrl: primary ? storeOrigin(primary.hostname, request.url) : null,
    owner: tenant.role === "owner",
    i18n: translations(context, "design", "forms", "storefront", "pages"),
  };
}

/**
 * A photo from the form, re-encoded as WebP with the store's files at each of `sizes` (longest
 * side, px); undefined when none came.
 */
async function photo(
  tenant: Parameters<typeof uploadStoreImage>[0],
  value: FormDataEntryValue | null,
  sizes: number[],
) {
  if (!(value instanceof File) || value.size === 0) return undefined;
  if (value.size > PHOTO_MAX_BYTES || !value.type.startsWith("image/")) throw new PhotoError();
  try {
    return await Promise.all(sizes.map((maxSize) => uploadStoreImage(tenant, value, { maxSize })));
  } catch {
    throw new PhotoError();
  }
}

class PhotoError extends Error {}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = context.get(tenantContext);
  if (tenant.role !== "owner") throw data("Only owners change the design", { status: 403 });
  const formData = await request.formData();
  const submission = parseWithZod(formData, { schema: storeThemeSchema });
  if (submission.status !== "success") {
    return data({ result: submission.reply(), saved: false }, { status: 400 });
  }
  try {
    // The logo stays small; the cover goes big for wide screens and at 720 px for phones.
    const [logo, hero] = await Promise.all([
      photo(tenant, formData.get("logo"), [400]),
      photo(tenant, formData.get("heroImage"), [1600, 720]),
    ]);
    await updateStoreTheme(tenant, submission.value, {
      logoUrl: logo?.[0],
      hero: hero ? { url: hero[0] ?? "", smallUrl: hero[1] ?? "" } : undefined,
    });
  } catch (error) {
    if (!(error instanceof PhotoError)) throw error;
    return data(
      { result: submission.reply({ formErrors: ["design.photoInvalid"] }), saved: false },
      { status: 400 },
    );
  }
  return { result: submission.reply(), saved: true };
}

export default function Design({ loaderData, actionData, params }: Route.ComponentProps) {
  const t = useT();
  const navigation = useNavigation();
  const { settings, owner } = loaderData;
  const highlights = settings.highlights ?? [];
  const hiddenFilters = settings.hiddenFilters ?? [];
  const [form, fields] = useForm({
    id: "design",
    lastResult: actionData?.result,
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: storeThemeSchema }),
    defaultValue: {
      theme: storeThemeIds.includes(settings.theme as StoreThemeId)
        ? settings.theme
        : storeThemeIds[0],
      palette: settings.palette ?? "",
      brandColor: settings.brandColor ?? "",
      heroTitle: settings.heroTitle ?? "",
      heroSubtitle: settings.heroSubtitle ?? "",
      announcement: settings.announcement ?? "",
      categoriesLabel: settings.categoriesLabel ?? "",
      highlight1: highlights[0] ?? "",
      highlight2: highlights[1] ?? "",
      highlight3: highlights[2] ?? "",
      heroEyebrow: settings.heroEyebrow ?? "",
      heroButtonLabel: settings.heroButtonLabel ?? "",
      heroButtonHref: settings.heroButtonHref ?? "",
      heroIllustration: settings.heroIllustration ?? "",
    },
  });
  const theme = (fields.theme.value as StoreThemeId | undefined) ?? storeThemeIds[0];
  const brandColor = normalizeHex(fields.brandColor.value ?? "") ?? "";
  // A palette of another theme falls back to this theme's first, as the store will.
  const palette = paletteOf(theme, fields.palette.value).id;
  const [scheme, setScheme] = useState<"light" | "dark">("light");
  const busy = navigation.state === "submitting";

  return (
    <>
      <PageHeader title={t("design.title")} description={t("design.intro")}>
        {loaderData.storeUrl ? (
          <a
            href={loaderData.storeUrl}
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            {t("design.openStore")}
          </a>
        ) : null}
      </PageHeader>
      {owner ? null : (
        <p role="status" className="mb-4 rounded-md border p-3 text-sm">
          {t("design.ownersOnly")}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <Form
          method="post"
          encType="multipart/form-data"
          className="grid gap-6"
          {...getFormProps(form)}
        >
          <fieldset disabled={!owner} className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>{t("design.themeHeading")}</h2>
                </CardTitle>
                <CardDescription>{t("design.themeIntro")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  role="radiogroup"
                  aria-label={t("design.themeHeading")}
                  className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3"
                >
                  {storeThemeIds.map((id, index) => (
                    <label key={id} className="relative">
                      <input
                        {...getInputProps(fields.theme, { type: "radio", value: id })}
                        key={`${id}-${fields.theme.initialValue}`}
                        id={`${fields.theme.id}-${id}`}
                        className="peer sr-only"
                      />
                      <span className="grid h-full cursor-pointer gap-2 rounded-lg border-2 p-3 peer-checked:border-primary peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 hover:border-primary">
                        <ThemePreview theme={id} compact name={loaderData.workspaceName} />
                        <span className="flex items-center gap-2 font-medium">
                          {t(`design.theme_${id}`)}
                          {index === 0 ? (
                            <span className="rounded-full border px-2 py-0.5 text-xs font-normal">
                              {t("design.defaultTheme")}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {t(`design.theme_${id}For`)}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <FieldErrors id={fields.theme.errorId} errors={fields.theme.errors} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>{t("design.colorsHeading")}</h2>
                </CardTitle>
                <CardDescription>{t("design.colorsIntro")}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                <fieldset key={theme} className="grid gap-2">
                  <legend className="sr-only">{t("design.colorsLegend")}</legend>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {storeThemes[theme].palettes.map((option) => (
                      <label key={option.id} className="relative">
                        <input
                          type="radio"
                          name={fields.palette.name}
                          form={form.id}
                          value={option.id}
                          defaultChecked={option.id === palette}
                          className="peer sr-only"
                        />
                        <span className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border-2 p-2 peer-checked:border-primary peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 hover:border-primary">
                          <Swatch colors={option} />
                          <span className="text-sm font-medium">
                            {t(`design.palette_${option.id}`)}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="grid grid-cols-[auto_1fr] items-start gap-3">
                  <input
                    type="color"
                    aria-label={t("design.pickColor")}
                    value={brandColor || paletteOf(theme, palette).light.primary}
                    onChange={(event) =>
                      form.update({ name: fields.brandColor.name, value: event.target.value })
                    }
                    className="mt-7 h-11 w-14 cursor-pointer rounded-md border bg-background p-1"
                  />
                  <TextField
                    field={fields.brandColor}
                    label={t("design.brandColor")}
                    description={t("design.ownColorHint")}
                    placeholder="#be185d"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </div>
                {brandColor ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-self-start"
                    onClick={() => form.update({ name: fields.brandColor.name, value: "" })}
                  >
                    {t("design.useThemeColor")}
                  </Button>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>{t("design.brandHeading")}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5">
                <PhotoField
                  name="logo"
                  label={t("design.logo")}
                  hint={t("design.logoHint")}
                  current={settings.logoUrl}
                  remove={fields.removeLogo}
                  removeLabel={t("design.removeLogo")}
                />
                <PhotoField
                  name="heroImage"
                  label={t("design.heroImage")}
                  hint={t("design.heroImageHint")}
                  current={settings.heroImageUrl}
                  remove={fields.removeHero}
                  removeLabel={t("design.removeHero")}
                  wide
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>{t("design.frontHeading")}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <p className="rounded-md border bg-muted p-3 text-sm">
                  {t("design.pagesTip")}{" "}
                  <Link
                    to={href("/app/:workspace/pages", { workspace: params.workspace })}
                    className="font-medium underline underline-offset-4"
                  >
                    {t("design.pagesTipLink")}
                  </Link>
                </p>
                <Check
                  name={fields.hideHero.name}
                  inverted
                  label={t("design.showHero")}
                  hint={t("design.showHeroHint")}
                  defaultChecked={!settings.hideHero}
                />
                <TextField
                  field={fields.heroEyebrow}
                  label={t("design.heroEyebrow")}
                  description={t("design.heroEyebrowHint")}
                />
                <TextField
                  field={fields.heroTitle}
                  label={t("design.heroTitle")}
                  description={t("design.heroTitleHint")}
                />
                <TextField
                  field={fields.heroSubtitle}
                  label={t("design.heroSubtitle")}
                  description={t("design.heroSubtitleHint")}
                />
                <TextField
                  field={fields.heroButtonLabel}
                  label={t("design.heroButtonLabel")}
                  description={t("design.heroButtonLabelHint")}
                />
                <TextField
                  field={fields.heroButtonHref}
                  label={t("design.heroButtonHref")}
                  description={t("design.heroButtonHrefHint")}
                />
                <div className="grid gap-2">
                  <Label htmlFor="hero-illustration">{t("design.heroIllustration")}</Label>
                  <select
                    id="hero-illustration"
                    name={fields.heroIllustration.name}
                    defaultValue={settings.heroIllustration ?? ""}
                    className="h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
                  >
                    <option value="">{t("pages.illustrationNone")}</option>
                    {storeIllustrationIds.map((id) => (
                      <option key={id} value={id}>
                        {t(illustrationKeys[id])}
                      </option>
                    ))}
                  </select>
                </div>
                <TextField
                  field={fields.announcement}
                  label={t("design.announcement")}
                  description={t("design.announcementHint")}
                />
                <TextField
                  field={fields.categoriesLabel}
                  label={t("design.categoriesLabel")}
                  description={t("design.categoriesLabelHint")}
                  placeholder={t("design.categoriesLabelPlaceholder")}
                />
                <fieldset className="grid gap-3">
                  <legend className="mb-1 text-sm font-medium">
                    {t("design.highlightsHeading")}
                  </legend>
                  <p className="text-sm text-muted-foreground">{t("design.highlightsHint")}</p>
                  <Check
                    name={fields.hideHighlights.name}
                    inverted
                    label={t("design.showHighlights")}
                    defaultChecked={!settings.hideHighlights}
                  />
                  {[fields.highlight1, fields.highlight2, fields.highlight3].map((field, i) => (
                    <TextField
                      key={field.name}
                      field={field}
                      label={t("design.highlight", { n: String(i + 1) })}
                    />
                  ))}
                </fieldset>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>{t("design.menuHeading")}</h2>
                </CardTitle>
                <CardDescription>{t("design.menuIntro")}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <MenuEditor
                  name={fields.menu.name}
                  initial={settings.menu ?? []}
                  options={loaderData.linkOptions}
                  max={STORE_MENU_MAX}
                  nested
                  empty={t("design.menuEmpty")}
                />
                <FieldErrors id={fields.menu.errorId} errors={fields.menu.errors} />
                <Check
                  name={fields.hideCategoriesMenu.name}
                  inverted
                  label={t("design.showCategoriesMenu")}
                  hint={t("design.showCategoriesMenuHint")}
                  defaultChecked={!settings.hideCategoriesMenu}
                />
                <Check
                  name={fields.categoryChips.name}
                  label={t("design.categoryChips")}
                  hint={t("design.categoryChipsHint")}
                  defaultChecked={Boolean(settings.categoryChips)}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>{t("design.footerHeading")}</h2>
                </CardTitle>
                <CardDescription>{t("design.footerIntro")}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <MenuEditor
                  name={fields.footerMenu.name}
                  initial={settings.footerMenu ?? []}
                  options={loaderData.linkOptions}
                  max={FOOTER_MENU_MAX}
                  empty={t("design.footerEmpty")}
                />
                <FieldErrors id={fields.footerMenu.errorId} errors={fields.footerMenu.errors} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>{t("design.filtersHeading")}</h2>
                </CardTitle>
                <CardDescription>{t("design.filtersIntro")}</CardDescription>
              </CardHeader>
              <CardContent>
                <fieldset className="grid gap-1">
                  <legend className="sr-only">{t("design.filtersHeading")}</legend>
                  {loaderData.filters.map((filter) => (
                    <div key={filter.key} className="flex min-h-11 items-center gap-3">
                      <input type="hidden" name={fields.offeredFilters.name} value={filter.key} />
                      <input
                        id={`filter-${filter.key}`}
                        type="checkbox"
                        name={fields.shownFilters.name}
                        value={filter.key}
                        defaultChecked={!hiddenFilters.includes(filter.key)}
                        className="size-5 accent-primary"
                      />
                      <Label htmlFor={`filter-${filter.key}`} className="font-normal">
                        {filter.name ??
                          (filter.key === "price"
                            ? t("design.filterPrice")
                            : t("design.filterAvailability"))}
                      </Label>
                    </div>
                  ))}
                </fieldset>
              </CardContent>
            </Card>
          </fieldset>
          <FieldErrors id={form.errorId} errors={form.errors} />
          {owner ? (
            <div className="sticky bottom-20 z-10 grid gap-2 rounded-lg border bg-background p-3 md:bottom-4">
              <Button type="submit" disabled={busy}>
                {busy ? t("design.saving") : t("design.save")}
              </Button>
              {actionData?.saved && navigation.state === "idle" ? (
                <p role="status" className="text-center text-sm">
                  {t("design.saved")}
                </p>
              ) : null}
            </div>
          ) : null}
        </Form>
        <section
          aria-labelledby="design-preview"
          className="order-first grid gap-2 lg:order-none lg:sticky lg:top-6"
        >
          <h2 id="design-preview" className="font-semibold">
            {t("design.preview")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("design.previewHint")}</p>
          <fieldset className="flex items-center gap-2">
            <legend className="sr-only">{t("design.previewScheme")}</legend>
            {(["light", "dark"] as const).map((mode) => (
              <Button
                key={mode}
                type="button"
                variant={scheme === mode ? "default" : "outline"}
                aria-pressed={scheme === mode}
                className="min-h-11 px-4"
                onClick={() => setScheme(mode)}
              >
                {mode === "light" ? (
                  <SunIcon aria-hidden className="size-4" />
                ) : (
                  <MoonIcon aria-hidden className="size-4" />
                )}
                {t(mode === "light" ? "design.previewLight" : "design.previewDark")}
              </Button>
            ))}
          </fieldset>
          <ThemePreview
            theme={theme}
            palette={palette}
            scheme={scheme}
            brandColor={brandColor}
            name={loaderData.workspaceName}
            logoUrl={fields.removeLogo.value === "on" ? null : settings.logoUrl}
            heroImageUrl={fields.removeHero.value === "on" ? null : settings.heroImageUrl}
            title={fields.heroTitle.value}
            hideHero={fields.hideHero.value === "on"}
            announcement={fields.announcement.value}
          />
        </section>
      </div>
    </>
  );
}

function PhotoField({
  name,
  label,
  hint,
  current,
  remove,
  removeLabel,
  wide = false,
}: {
  name: string;
  label: string;
  hint: string;
  current: string | undefined;
  remove: Parameters<typeof getInputProps>[0];
  removeLabel: string;
  wide?: boolean;
}) {
  const t = useT();
  const id = `design-${name}`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {current ? (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {t("design.currentPhoto")}
          <img
            src={current}
            alt=""
            className={cn(
              "h-12 rounded border bg-muted object-contain",
              wide ? "w-24 object-cover" : "w-auto",
            )}
          />
        </div>
      ) : null}
      <input
        id={id}
        name={name}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-describedby={`${id}-hint`}
        className="min-h-11 text-sm file:mr-3 file:h-11 file:rounded-md file:border file:bg-background file:px-4 file:text-sm file:font-medium"
      />
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        {hint}
      </p>
      {current ? (
        <div className="flex min-h-11 items-center gap-3">
          <input
            {...getInputProps(remove, { type: "checkbox" })}
            className="size-5 accent-primary"
          />
          <Label htmlFor={remove.id} className="font-normal">
            {removeLabel}
          </Label>
        </div>
      ) : null}
    </div>
  );
}

/** A palette at a glance: its light and dark pages, each with its brand color on top. */
function Swatch({ colors }: { colors: ThemePalette }) {
  return (
    <span aria-hidden className="flex shrink-0 overflow-hidden rounded-full border">
      {(["light", "dark"] as const).map((mode) => (
        <span
          key={mode}
          className="grid size-7 place-items-center"
          style={{ backgroundColor: colors[mode].background }}
        >
          <span
            className="size-3.5 rounded-full"
            style={{ backgroundColor: colors[mode].primary }}
          />
        </span>
      ))}
    </span>
  );
}

/**
 * A tick box. `inverted` says the opposite of what it sends: "Show the cover" ticked sends
 * nothing, unticked sends `hideHero=on`, so a store that never saw the box keeps its cover.
 */
function Check({
  name,
  label,
  hint,
  defaultChecked,
  inverted = false,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked: boolean;
  inverted?: boolean;
}) {
  const id = useId();
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <div className="grid gap-1">
      <div className="flex min-h-11 items-center gap-3">
        <input
          id={id}
          type="checkbox"
          name={inverted ? undefined : name}
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="size-5 accent-primary"
        />
        {inverted && !checked ? <input type="hidden" name={name} value="on" /> : null}
        <Label htmlFor={id} className="font-normal">
          {label}
        </Label>
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="pl-8 text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface LinkOption {
  label: string;
  href: string;
}

type MenuRow = { label: string; href: string; children?: { label: string; href: string }[] };

/**
 * A menu's links, one card each: its text, where it goes (typed or picked from the store's
 * pages and categories) and, in the top menu, links under it. Sent as JSON in one field.
 */
function MenuEditor({
  name,
  initial,
  options,
  max,
  nested = false,
  empty,
}: {
  name: string;
  initial: MenuRow[];
  options: LinkOption[];
  max: number;
  nested?: boolean;
  empty: string;
}) {
  const t = useT();
  const [rows, setRows] = useState<MenuRow[]>(initial);
  const set = (index: number, patch: Partial<MenuRow>) =>
    setRows(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  const move = (index: number, by: -1 | 1) => {
    const next = [...rows];
    const [moved] = next.splice(index, 1);
    if (moved) next.splice(index + by, 0, moved);
    setRows(next);
  };
  const hintId = useId();
  return (
    <div className="grid gap-3">
      <input type="hidden" name={name} value={JSON.stringify(rows)} />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ol className="grid gap-3">
          {rows.map((row, index) => {
            const n = String(index + 1);
            const children = row.children ?? [];
            return (
              <li key={index} className="grid gap-3 rounded-md border p-3">
                <LinkRow
                  label={row.label}
                  href={row.href}
                  labelText={t("design.menuLabel", { n })}
                  hrefText={t("design.menuHref", { n })}
                  hintId={hintId}
                  options={options}
                  onChange={(patch) => set(index, patch)}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("design.menuUp", { n })}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUpIcon aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("design.menuDown", { n })}
                    disabled={index === rows.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDownIcon aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("design.menuRemove", { n })}
                    onClick={() => setRows(rows.filter((_, at) => at !== index))}
                  >
                    <Trash2Icon aria-hidden />
                  </Button>
                </LinkRow>
                {nested ? (
                  <fieldset className="grid gap-3 border-l-2 pl-3">
                    <legend className="mb-1 text-sm font-medium">
                      {t("design.menuChildren", { name: row.label || n })}
                    </legend>
                    {children.map((child, at) => {
                      const m = String(at + 1);
                      const setChild = (patch: Partial<MenuRow>) =>
                        set(index, {
                          children: children.map((other, i) =>
                            i === at ? { ...other, ...patch } : other,
                          ),
                        });
                      return (
                        <LinkRow
                          key={at}
                          label={child.label}
                          href={child.href}
                          labelText={t("design.menuChildLabel", { n: m })}
                          hrefText={t("design.menuChildHref", { n: m })}
                          hintId={hintId}
                          options={options}
                          onChange={setChild}
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={t("design.menuRemoveChild", { n: m })}
                            onClick={() =>
                              set(index, { children: children.filter((_, i) => i !== at) })
                            }
                          >
                            <Trash2Icon aria-hidden />
                          </Button>
                        </LinkRow>
                      );
                    })}
                    <Button
                      type="button"
                      variant="ghost"
                      className="justify-self-start"
                      disabled={children.length >= STORE_SUBMENU_MAX}
                      onClick={() =>
                        set(index, { children: [...children, { label: "", href: "" }] })
                      }
                    >
                      <PlusIcon aria-hidden />
                      {t("design.menuAddChild")}
                    </Button>
                  </fieldset>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
      <p id={hintId} className="text-sm text-muted-foreground">
        {t("design.menuHrefHint")}
      </p>
      <Button
        type="button"
        variant="outline"
        className="justify-self-start"
        disabled={rows.length >= max}
        onClick={() =>
          setRows([
            ...rows,
            nested ? { label: "", href: "", children: [] } : { label: "", href: "" },
          ])
        }
      >
        <PlusIcon aria-hidden />
        {t("design.menuAdd")}
      </Button>
    </div>
  );
}

function LinkRow({
  label,
  href: target,
  labelText,
  hrefText,
  hintId,
  options,
  onChange,
  children,
}: {
  label: string;
  href: string;
  labelText: string;
  hrefText: string;
  hintId: string;
  options: LinkOption[];
  onChange: (patch: { label?: string; href?: string }) => void;
  children: React.ReactNode;
}) {
  const t = useT();
  const id = useId();
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div className="grid gap-1">
        <Label htmlFor={`${id}-label`}>{labelText}</Label>
        <Input
          id={`${id}-label`}
          value={label}
          maxLength={40}
          onChange={(event) => onChange({ label: event.target.value })}
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`${id}-href`}>{hrefText}</Label>
        <Input
          id={`${id}-href`}
          value={target}
          maxLength={500}
          inputMode="url"
          aria-describedby={hintId}
          onChange={(event) => onChange({ href: event.target.value.trim() })}
        />
      </div>
      <div className="flex gap-1">{children}</div>
      {options.length > 0 ? (
        <select
          aria-label={`${t("design.menuPick")} (${labelText})`}
          value=""
          onChange={(event) => {
            const option = options.find((o) => o.href === event.target.value);
            if (option) onChange({ href: option.href, label: label || option.label });
          }}
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:col-span-2 md:text-sm"
        >
          <option value="">{t("design.menuPick")}</option>
          {options.map((option) => (
            <option key={option.href} value={option.href}>
              {option.label} · {option.href}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
