import { getFormProps, getInputProps, getTextareaProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  DEFAULT_DOWNLOAD_DAYS,
  DEFAULT_DOWNLOAD_LIMIT,
  newDigitalProductSchema,
} from "@monaztore/contracts";
import { createDigitalProduct, DomainError, storeCurrency } from "@monaztore/core";
import { data, Form, href, Link, redirect, useNavigation } from "react-router";
import { PageHeader } from "~/components/page-header";
import { FieldErrors, TextField } from "~/components/text-field";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { tenantContext } from "~/context";
import { metaT, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { uploadStoreImage } from "~/lib/page-images.server";
import { files } from "~/lib/services.server";
import type { Route } from "./+types/digital-product-new";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("digital.newTitle") }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const tenant = context.get(tenantContext);
  if (tenant.role !== "owner") throw data("Only owners create products", { status: 404 });
  return {
    currency: await storeCurrency(tenant),
    i18n: translations(context, "digital", "forms"),
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const tenant = context.get(tenantContext);
  if (tenant.role !== "owner") throw data("Only owners create products", { status: 403 });
  const formData = await request.formData();
  const submission = parseWithZod(formData, { schema: newDigitalProductSchema });
  if (submission.status !== "success") {
    return data({ result: submission.reply({ hideFields: ["file", "photo"] }) }, { status: 400 });
  }
  const { file, photo, ...input } = submission.value;
  const refused = (fieldErrors: Record<string, string[]>) =>
    // Files never go back to the browser: it can't put them in the form again.
    data(
      { result: submission.reply({ fieldErrors, hideFields: ["file", "photo"] }) },
      { status: 400 },
    );
  let imageUrl: string | null = null;
  if (photo) {
    try {
      imageUrl = await uploadStoreImage(tenant, photo, { maxSize: 1600 });
    } catch {
      return refused({ photo: ["forms.photoInvalid"] });
    }
  }
  try {
    const productId = await createDigitalProduct(
      tenant,
      { files },
      {
        ...input,
        imageUrl,
        file: {
          bytes: new Uint8Array(await file.arrayBuffer()),
          fileName: file.name,
          contentType: file.type,
        },
      },
    );
    throw redirect(
      `${href("/app/:workspace/downloads/:productId", { workspace: params.workspace, productId })}?created`,
    );
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    if (error.code === "price_invalid") return refused({ price: ["forms.priceInvalid"] });
    return refused({
      file: [
        error.code === "file_too_big" ? "forms.digitalFileTooBig" : "forms.digitalFileRequired",
      ],
    });
  }
}

export default function NewDigitalProduct({
  loaderData,
  actionData,
  params,
}: Route.ComponentProps) {
  const t = useT();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const [form, fields] = useForm({
    id: "new-digital-product",
    lastResult: actionData?.result,
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: newDigitalProductSchema }),
    defaultValue: {
      downloadLimit: String(DEFAULT_DOWNLOAD_LIMIT),
      downloadDays: String(DEFAULT_DOWNLOAD_DAYS),
    },
  });
  const descriptionHint = `${fields.description.id}-description`;

  return (
    <div className="mx-auto max-w-xl">
      <Link
        to={href("/app/:workspace/downloads", { workspace: params.workspace })}
        className="mb-4 inline-flex min-h-11 items-center text-sm underline underline-offset-4"
      >
        ← {t("digital.back")}
      </Link>
      <PageHeader title={t("digital.newTitle")} description={t("digital.newIntro")} />
      <Form
        method="post"
        encType="multipart/form-data"
        className="grid gap-6 pb-24 md:pb-0"
        {...getFormProps(form)}
      >
        <TextField field={fields.name} label={t("digital.nameLabel")} autoComplete="off" />
        <TextField
          field={fields.price}
          label={t("digital.priceLabel", { currency: loaderData.currency })}
          description={t("digital.priceHint")}
          inputMode="decimal"
          autoComplete="off"
        />
        <div className="grid gap-2">
          <Label htmlFor={fields.file.id}>{t("digital.fileLabel")}</Label>
          <Input
            {...getInputProps(fields.file, {
              type: "file",
              ariaDescribedBy: `${fields.file.id}-hint`,
            })}
            key={fields.file.key}
            className="py-2"
          />
          <p id={`${fields.file.id}-hint`} className="text-sm text-muted-foreground">
            {t("digital.fileHint")}
          </p>
          <FieldErrors id={fields.file.errorId} errors={fields.file.errors} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={fields.description.id}>{t("digital.descriptionLabel")}</Label>
          <textarea
            {...getTextareaProps(fields.description, { ariaDescribedBy: descriptionHint })}
            key={fields.description.key}
            rows={4}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm"
          />
          <p id={descriptionHint} className="text-sm text-muted-foreground">
            {t("digital.descriptionHint")}
          </p>
          <FieldErrors id={fields.description.errorId} errors={fields.description.errors} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={fields.photo.id}>{t("digital.photoLabel")}</Label>
          <Input
            {...getInputProps(fields.photo, {
              type: "file",
              ariaDescribedBy: `${fields.photo.id}-hint`,
            })}
            key={fields.photo.key}
            accept="image/jpeg,image/png,image/webp"
            className="py-2"
          />
          <p id={`${fields.photo.id}-hint`} className="text-sm text-muted-foreground">
            {t("digital.photoHint")}
          </p>
          <FieldErrors id={fields.photo.errorId} errors={fields.photo.errors} />
        </div>
        <fieldset className="grid gap-4 rounded-md border p-4">
          <legend className="px-1 font-medium">{t("digital.rulesHeading")}</legend>
          <p className="text-sm text-muted-foreground">{t("digital.rulesIntro")}</p>
          <TextField
            field={fields.downloadLimit}
            label={t("digital.limitLabel")}
            description={t("digital.limitHint")}
            inputMode="numeric"
          />
          <TextField
            field={fields.downloadDays}
            label={t("digital.daysLabel")}
            description={t("digital.daysHint")}
            inputMode="numeric"
          />
        </fieldset>
        <FieldErrors id={form.errorId} errors={form.errors} />
        <Button type="submit" size="lg" className="w-full md:w-auto" disabled={busy}>
          {busy ? t("digital.creating") : t("digital.create")}
        </Button>
      </Form>
    </div>
  );
}
