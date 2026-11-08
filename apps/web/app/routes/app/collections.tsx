import { getFormProps, getSelectProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { categoryFormSchema } from "@monaztore/contracts";
import {
  createCategory,
  deleteCategory,
  listCategories,
  NotFoundError,
  renameCategory,
} from "@monaztore/core";
import { Trash2Icon } from "lucide-react";
import { data, href, Link, useFetcher } from "react-router";
import { z } from "zod/mini";
import { PageHeader } from "~/components/page-header";
import { CatalogTabs } from "~/components/products/catalog-tabs";
import { FieldErrors, TextField } from "~/components/text-field";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { tenantContext } from "~/context";
import { metaT, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/collections";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("products.collectionsTitle") }];
}

export async function loader({ context }: Route.LoaderArgs) {
  return {
    categories: await listCategories(context.get(tenantContext)),
    i18n: translations(context, "products", "forms"),
  };
}

const renameSchema = z.object({ id: z.uuid(), name: categoryFormSchema.shape.name });

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = context.get(tenantContext);
  const formData = await request.formData();
  const intent = formData.get("intent");
  try {
    if (intent === "create") {
      const submission = parseWithZod(formData, { schema: categoryFormSchema });
      if (submission.status !== "success")
        return data({ intent, result: submission.reply() }, { status: 400 });
      await createCategory(tenant, submission.value);
      return { intent, result: submission.reply({ resetForm: true }) };
    }
    if (intent === "rename") {
      const parsed = renameSchema.safeParse(Object.fromEntries(formData));
      if (!parsed.success) return data({ intent, result: undefined }, { status: 400 });
      await renameCategory(tenant, parsed.data.id, parsed.data.name);
      return { intent, result: undefined };
    }
    if (intent === "delete") {
      await deleteCategory(tenant, String(formData.get("id") ?? ""));
      return { intent, result: undefined };
    }
  } catch (error) {
    if (error instanceof NotFoundError) throw data("Collection not found", { status: 404 });
    throw error;
  }
  throw data("Unknown intent", { status: 400 });
}

export default function Collections({ loaderData, params }: Route.ComponentProps) {
  const t = useT();
  const { categories } = loaderData;
  const create = useFetcher<typeof action>({ key: "create-collection" });
  const [form, fields] = useForm({
    id: "create-collection",
    lastResult:
      create.state === "idle" && create.data?.intent === "create" ? create.data.result : undefined,
    shouldValidate: "onBlur",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: categoryFormSchema }),
  });

  return (
    <>
      <PageHeader
        title={t("products.collectionsTitle")}
        description={t("products.collectionsIntro")}
      />
      <CatalogTabs workspace={params.workspace} />
      <create.Form
        method="post"
        {...getFormProps(form)}
        className="mb-6 grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start"
      >
        <input type="hidden" name="intent" value="create" />
        <TextField
          field={fields.name}
          label={t("products.collectionName")}
          placeholder={t("products.newCollectionPlaceholder")}
        />
        <div className="grid gap-2">
          <Label htmlFor={fields.parentId.id}>{t("products.collectionParent")}</Label>
          <select
            {...getSelectProps(fields.parentId)}
            key={fields.parentId.key}
            className="h-11 rounded-md border bg-background px-3"
          >
            <option value="">{t("products.noParent")}</option>
            {categories
              .filter((c) => c.parentId === null)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          <FieldErrors id={fields.parentId.errorId} errors={fields.parentId.errors} />
        </div>
        <Button type="submit" className="sm:mt-7" disabled={create.state !== "idle"}>
          {t("products.addCollection")}
        </Button>
      </create.Form>
      {categories.length === 0 ? (
        <p role="status" className="rounded-md border p-6 text-center text-muted-foreground">
          {t("products.noCollections")}
        </p>
      ) : (
        <ul className="grid divide-y rounded-md border">
          {categories.map((category) => (
            <CollectionRow key={category.id} category={category} workspace={params.workspace} />
          ))}
        </ul>
      )}
    </>
  );
}

function CollectionRow({
  category,
  workspace,
}: {
  category: { id: string; name: string; slug: string; parentId: string | null; products: number };
  workspace: string;
}) {
  const t = useT();
  const fetcher = useFetcher<typeof action>();
  const inputId = `collection-${category.id}`;
  return (
    <li
      className={cn(
        "grid gap-2 p-3 sm:grid-cols-[1fr_auto] sm:items-center",
        category.parentId && "sm:pl-8",
      )}
    >
      <fetcher.Form method="post" className="flex items-end gap-2">
        <input type="hidden" name="intent" value="rename" />
        <input type="hidden" name="id" value={category.id} />
        <div className="grid flex-1 gap-1">
          <Label htmlFor={inputId} className="text-xs text-muted-foreground">
            {category.parentId ? t("products.subcollection") : t("products.collectionName")} ·
            /collections/{category.slug}
          </Label>
          <Input id={inputId} name="name" defaultValue={category.name} maxLength={80} required />
        </div>
        <Button type="submit" variant="outline" disabled={fetcher.state !== "idle"}>
          {t("products.rename")}
        </Button>
      </fetcher.Form>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <Link
          to={`${href("/app/:workspace/products", { workspace })}?category=${category.id}`}
          className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
        >
          {t("products.productsCount", { count: category.products })}
        </Link>
        <fetcher.Form
          method="post"
          onSubmit={(event) => {
            if (!window.confirm(t("products.deleteCollectionConfirm", { name: category.name })))
              event.preventDefault();
          }}
        >
          <input type="hidden" name="intent" value="delete" />
          <input type="hidden" name="id" value={category.id} />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            aria-label={t("products.deleteCollection", { name: category.name })}
          >
            <Trash2Icon aria-hidden className="size-4" />
          </Button>
        </fetcher.Form>
      </div>
    </li>
  );
}
