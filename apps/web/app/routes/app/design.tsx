import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  normalizeHex,
  type StoreThemeId,
  storeThemeIds,
  storeThemeSchema,
} from "@monaztore/contracts";
import {
  getThemeSettings,
  getWorkspace,
  listStoreDomains,
  updateStoreTheme,
} from "@monaztore/core";
import { paletteOf, storeThemes, type ThemePalette } from "@monaztore/core/themes";
import { MoonIcon, SunIcon } from "lucide-react";
import { useState } from "react";
import { data, Form, useNavigation } from "react-router";
import { PageHeader } from "~/components/page-header";
import { ThemePreview } from "~/components/storefront/theme-preview";
import { FieldErrors, TextField } from "~/components/text-field";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import { tenantContext } from "~/context";
import { metaT, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
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
  const [settings, domains, workspace] = await Promise.all([
    getThemeSettings(tenant),
    listStoreDomains(tenant),
    getWorkspace(tenant),
  ]);
  const primary = domains.find((domain) => domain.primary) ?? domains[0];
  return {
    settings,
    workspaceName: workspace.name,
    storeUrl: primary ? storeOrigin(primary.hostname, request.url) : null,
    owner: tenant.role === "owner",
    i18n: translations(context, "design", "forms", "storefront"),
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

export default function Design({ loaderData, actionData }: Route.ComponentProps) {
  const t = useT();
  const navigation = useNavigation();
  const { settings, owner } = loaderData;
  const highlights = settings.highlights ?? [];
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
      highlight1: highlights[0] ?? "",
      highlight2: highlights[1] ?? "",
      highlight3: highlights[2] ?? "",
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
                  field={fields.announcement}
                  label={t("design.announcement")}
                  description={t("design.announcementHint")}
                />
                <fieldset className="grid gap-3">
                  <legend className="mb-1 text-sm font-medium">
                    {t("design.highlightsHeading")}
                  </legend>
                  <p className="text-sm text-muted-foreground">{t("design.highlightsHint")}</p>
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
