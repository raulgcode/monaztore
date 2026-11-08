import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { downloadRulesSchema, formatFileSize, productFileSchema } from "@monaztore/contracts";
import {
  addProductFile,
  DomainError,
  getDigitalProduct,
  listStoreDomains,
  removeProductFile,
  setDownloadRules,
} from "@monaztore/core";
import { FileIcon, TrashIcon } from "lucide-react";
import { data, href, Link, useFetcher, useSearchParams } from "react-router";
import { PageHeader } from "~/components/page-header";
import { FieldErrors, TextField } from "~/components/text-field";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { tenantContext } from "~/context";
import { metaT, useLocale, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { files } from "~/lib/services.server";
import { storeOrigin } from "~/lib/store-seo";
import type { Route } from "./+types/digital-product";

export function meta({ loaderData, matches }: Route.MetaArgs) {
  return [{ title: loaderData?.product.name ?? metaT(matches)("digital.title") }];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const tenant = context.get(tenantContext);
  const [product, domains] = await Promise.all([
    getDigitalProduct(tenant, params.productId),
    listStoreDomains(tenant),
  ]);
  if (!product) throw data("Product not found", { status: 404 });
  const primary = domains[0];
  return {
    product,
    productUrl:
      primary && product.status === "active"
        ? `${storeOrigin(primary.hostname, request.url)}${href("/products/:slug", { slug: product.slug })}`
        : null,
    owner: tenant.role === "owner",
    i18n: translations(context, "digital", "forms"),
  };
}

type Done = "fileAdded" | "fileRemoved" | "rulesSaved" | "tooManyFiles";

export async function action({ request, params, context }: Route.ActionArgs) {
  const tenant = context.get(tenantContext);
  if (tenant.role !== "owner") throw data("Only owners change products", { status: 403 });
  const formData = await request.formData();
  const intent = formData.get("intent");
  try {
    if (intent === "add-file") {
      const submission = parseWithZod(formData, { schema: productFileSchema });
      if (submission.status !== "success") {
        return data(
          { intent, done: null, result: submission.reply({ hideFields: ["file"] }) },
          { status: 400 },
        );
      }
      const { file } = submission.value;
      await addProductFile(tenant, { files }, params.productId, {
        bytes: new Uint8Array(await file.arrayBuffer()),
        fileName: file.name,
        contentType: file.type,
      });
      return { intent, done: "fileAdded" as Done, result: submission.reply({ resetForm: true }) };
    }
    if (intent === "remove-file") {
      await removeProductFile(tenant, params.productId, String(formData.get("fileId") ?? ""));
      return { intent, done: "fileRemoved" as Done, result: undefined };
    }
    if (intent === "rules") {
      const submission = parseWithZod(formData, { schema: downloadRulesSchema });
      if (submission.status !== "success") {
        return data({ intent, done: null, result: submission.reply() }, { status: 400 });
      }
      await setDownloadRules(tenant, params.productId, submission.value);
      return { intent, done: "rulesSaved" as Done, result: submission.reply() };
    }
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    if (error.code === "not_found") throw data("Product not found", { status: 404 });
    if (error.code === "too_many_files") {
      return data({ intent, done: "tooManyFiles" as Done, result: undefined }, { status: 409 });
    }
    throw error;
  }
  throw data("Unknown intent", { status: 400 });
}

export default function DigitalProduct({ loaderData, params }: Route.ComponentProps) {
  const t = useT();
  const locale = useLocale();
  const [search] = useSearchParams();
  const { product, productUrl, owner } = loaderData;

  return (
    <div className="mx-auto grid max-w-2xl gap-8">
      <div>
        <Link
          to={href("/app/:workspace/downloads", { workspace: params.workspace })}
          className="mb-4 inline-flex min-h-11 items-center text-sm underline underline-offset-4"
        >
          ← {t("digital.back")}
        </Link>
        <PageHeader title={product.name}>
          {productUrl ? (
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <a href={productUrl} target="_blank" rel="noreferrer">
                {t("digital.viewInStore")}
              </a>
            </Button>
          ) : null}
        </PageHeader>
        {search.has("created") ? (
          <p role="status" className="rounded-md border border-primary p-3 text-sm">
            {t("digital.created")}
          </p>
        ) : null}
        {product.status === "active" ? null : (
          <p role="status" className="rounded-md border p-3 text-sm">
            {t("digital.notOnSale")}
          </p>
        )}
        {owner ? null : (
          <p role="status" className="mt-3 rounded-md border p-3 text-sm">
            {t("digital.ownersOnly")}
          </p>
        )}
      </div>

      <section aria-labelledby="files" className="grid gap-3">
        <div className="grid gap-1">
          <h2 id="files" className="text-lg font-semibold">
            {t("digital.filesHeading")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("digital.filesIntro")}</p>
        </div>
        {product.files.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            {t("digital.noFiles")}
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {product.files.map((file) => (
              <FileRow
                key={file.id}
                file={file}
                size={formatFileSize(file.size, locale)}
                canRemove={owner}
              />
            ))}
          </ul>
        )}
        {owner ? <AddFile /> : null}
      </section>

      <DownloadRules limit={product.downloadLimit} days={product.downloadDays} disabled={!owner} />
    </div>
  );
}

function FileRow({
  file,
  size,
  canRemove,
}: {
  file: { id: string; fileName: string };
  size: string;
  canRemove: boolean;
}) {
  const t = useT();
  const fetcher = useFetcher<typeof action>();
  const removing = fetcher.state !== "idle";
  return (
    <li className="flex min-h-14 items-center gap-3 px-4 py-2">
      <FileIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
      <span className="grid min-w-0 flex-1">
        <span className="truncate font-medium">{file.fileName}</span>
        <span className="text-sm text-muted-foreground">{size}</span>
      </span>
      {canRemove ? (
        <fetcher.Form method="post">
          <input type="hidden" name="fileId" value={file.id} />
          <Button
            type="submit"
            name="intent"
            value="remove-file"
            variant="ghost"
            size="icon"
            className="size-11"
            disabled={removing}
            aria-label={t("digital.removeFile", { name: file.fileName })}
          >
            <TrashIcon aria-hidden />
          </Button>
        </fetcher.Form>
      ) : null}
    </li>
  );
}

function AddFile() {
  const t = useT();
  const fetcher = useFetcher<typeof action>();
  const result = fetcher.data?.intent === "add-file" ? fetcher.data : undefined;
  const removed = fetcher.data?.intent === "remove-file" ? fetcher.data : undefined;
  const [form, fields] = useForm({
    id: "add-file",
    lastResult: result?.result,
    onValidate: ({ formData }) => parseWithZod(formData, { schema: productFileSchema }),
  });
  const busy = fetcher.state !== "idle";
  const done = result?.done ?? removed?.done;
  return (
    <fetcher.Form
      method="post"
      encType="multipart/form-data"
      className="grid gap-3 rounded-md border p-4"
      {...getFormProps(form)}
    >
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
      {done === "fileAdded" ? (
        <p role="status" className="text-sm">
          {t("digital.fileAdded")}
        </p>
      ) : done === "tooManyFiles" ? (
        <p role="alert" className="text-sm text-destructive">
          {t("digital.tooManyFiles")}
        </p>
      ) : null}
      <Button
        type="submit"
        name="intent"
        value="add-file"
        variant="outline"
        className="w-full sm:w-auto sm:justify-self-start"
        disabled={busy}
      >
        {busy ? t("digital.adding") : t("digital.addFile")}
      </Button>
    </fetcher.Form>
  );
}

function DownloadRules({
  limit,
  days,
  disabled,
}: {
  limit: number | null;
  days: number | null;
  disabled: boolean;
}) {
  const t = useT();
  const fetcher = useFetcher<typeof action>();
  const result = fetcher.data?.intent === "rules" ? fetcher.data : undefined;
  const [form, fields] = useForm({
    id: "download-rules",
    lastResult: result?.result,
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: downloadRulesSchema }),
    defaultValue: {
      downloadLimit: limit === null ? "" : String(limit),
      downloadDays: days === null ? "" : String(days),
    },
  });
  return (
    <section aria-labelledby="rules" className="grid gap-3">
      <div className="grid gap-1">
        <h2 id="rules" className="text-lg font-semibold">
          {t("digital.rulesHeading")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("digital.rulesIntro")}</p>
      </div>
      <fetcher.Form method="post" className="grid gap-4" {...getFormProps(form)}>
        <fieldset disabled={disabled} className="grid gap-4">
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
          {result?.done === "rulesSaved" ? (
            <p role="status" className="text-sm">
              {t("digital.rulesSaved")}
            </p>
          ) : null}
          <Button
            type="submit"
            name="intent"
            value="rules"
            className="w-full sm:w-auto sm:justify-self-start"
            disabled={fetcher.state !== "idle"}
          >
            {t("digital.saveRules")}
          </Button>
        </fieldset>
      </fetcher.Form>
    </section>
  );
}
