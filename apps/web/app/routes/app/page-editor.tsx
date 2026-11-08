import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { type PageBlock, pageBlocksSchema, pageFormSchema } from "@monaztore/contracts";
import {
  DomainError,
  deletePage,
  getPage,
  getStoreInfo,
  listStoreDomains,
  listTopCollections,
  NotFoundError,
  previewBlockProducts,
  updatePage,
} from "@monaztore/core";
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { data, href, Link, redirect, useFetcher } from "react-router";
import { PageHeader } from "~/components/page-header";
import { BlockEditor } from "~/components/pages/block-editor";
import { PageBlocks } from "~/components/pages/page-blocks";
import { FieldErrors, TextField } from "~/components/text-field";
import { Button } from "~/components/ui/button";
import { tenantContext } from "~/context";
import { metaT, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { uploadStoreImage } from "~/lib/page-images.server";
import { storeOrigin } from "~/lib/store-seo";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/page-editor";

export function meta({ matches, loaderData }: Route.MetaArgs) {
  return [{ title: metaT(matches)("pages.editTitle", { title: loaderData?.page.title ?? "" }) }];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const tenant = context.get(tenantContext);
  const page = await getPage(tenant, params.pageId);
  if (!page) throw data("Page not found", { status: 404 });
  const store = {
    db: tenant.db,
    store: { organizationId: tenant.organizationId, name: "", slug: "", hostname: "" },
  };
  const [domains, info, collections, products] = await Promise.all([
    listStoreDomains(tenant),
    getStoreInfo(store),
    listTopCollections(store),
    previewBlockProducts(tenant, page.blocks),
  ]);
  const primary = domains.find((domain) => domain.primary) ?? domains[0];
  return {
    page,
    products,
    collections,
    currency: info.currency,
    storeUrl: primary ? storeOrigin(primary.hostname, request.url) : null,
    owner: tenant.role === "owner",
    i18n: translations(context, "pages", "forms", "storefront"),
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const tenant = context.get(tenantContext);
  if (tenant.role !== "owner") throw data("Only owners change pages", { status: 403 });
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "upload") {
    const blockId = String(formData.get("blockId") ?? "");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return data({ intent, blockId, url: null }, { status: 400 });
    }
    try {
      const url = await uploadStoreImage(tenant, file);
      return { intent, blockId, url };
    } catch {
      return data({ intent, blockId, url: null }, { status: 400 });
    }
  }

  if (intent === "products") {
    const parsed = pageBlocksSchema.safeParse(JSON.parse(String(formData.get("blocks") ?? "[]")));
    return {
      intent,
      products: parsed.success ? await previewBlockProducts(tenant, parsed.data) : {},
    };
  }

  if (intent === "delete") {
    await deletePage(tenant, params.pageId);
    throw redirect(href("/app/:workspace/pages", { workspace: params.workspace }));
  }

  if (intent !== "draft" && intent !== "publish") throw data("Unknown intent", { status: 400 });
  const submission = parseWithZod(formData, { schema: pageFormSchema });
  if (submission.status !== "success") {
    return data({ intent, result: submission.reply(), done: false }, { status: 400 });
  }
  try {
    await updatePage(tenant, params.pageId, {
      ...submission.value,
      status: intent === "publish" ? "published" : "draft",
    });
  } catch (error) {
    if (error instanceof NotFoundError) throw data("Page not found", { status: 404 });
    if (!(error instanceof DomainError)) throw error;
    const key =
      error.code === "slug_taken"
        ? "forms.pageSlugTaken"
        : error.code === "invalid_slug"
          ? "forms.pageSlugReserved"
          : "forms.blocksInvalid";
    const field = error.code === "invalid_blocks" ? "blocks" : "slug";
    return data(
      { intent, result: submission.reply({ fieldErrors: { [field]: [key] } }), done: false },
      { status: 400 },
    );
  }
  return { intent, result: submission.reply(), done: true };
}

export default function PageEditor({ loaderData, params }: Route.ComponentProps) {
  const t = useT();
  const { page, collections, currency, storeUrl, owner } = loaderData;
  const save = useFetcher<typeof action>({ key: `page-${page.id}` });
  const upload = useFetcher<typeof action>();
  const productsPreview = useFetcher<typeof action>();
  const remove = useFetcher();
  const [blocks, setBlocks] = useState<PageBlock[]>(page.blocks);
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState<"edit" | "preview">("edit");

  const saveResult = save.data && "result" in save.data ? save.data : undefined;
  const [form, fields] = useForm({
    id: `page-${page.id}`,
    lastResult: save.state === "idle" ? saveResult?.result : undefined,
    defaultValue: {
      title: page.title,
      slug: page.slug,
      seoTitle: page.seoTitle ?? "",
      seoDescription: page.seoDescription ?? "",
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: pageFormSchema }),
  });

  // A photo that came back from the upload goes into its block.
  const uploaded = upload.data && "url" in upload.data ? upload.data : undefined;
  useEffect(() => {
    if (!uploaded?.url) return;
    setBlocks((current) =>
      current.map((block) =>
        block.id === uploaded.blockId && block.type === "image"
          ? { ...block, url: uploaded.url ?? "" }
          : block,
      ),
    );
    setDirty(true);
  }, [uploaded]);

  const changeBlocks = (next: PageBlock[]) => {
    const productsChanged =
      JSON.stringify(next.filter((b) => b.type === "products")) !==
      JSON.stringify(blocks.filter((b) => b.type === "products"));
    setBlocks(next);
    setDirty(true);
    if (productsChanged) {
      productsPreview.submit(
        { intent: "products", blocks: JSON.stringify(next) },
        { method: "post" },
      );
    }
  };

  const products =
    (productsPreview.data && "products" in productsPreview.data
      ? productsPreview.data.products
      : undefined) ?? loaderData.products;
  const saving = save.state !== "idle";
  const published = saveResult?.done
    ? saveResult.intent === "publish"
    : page.status === "published";
  const pageUrl = storeUrl ? `${storeUrl}/${fields.slug.value ?? page.slug}` : null;

  return (
    <>
      <Link
        to={href("/app/:workspace/pages", { workspace: params.workspace })}
        className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        <ArrowLeftIcon aria-hidden className="size-4" />
        {t("pages.back")}
      </Link>
      <PageHeader title={t("pages.editTitle", { title: page.title })}>
        {published && pageUrl ? (
          <a
            href={pageUrl}
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-11 items-center gap-1 underline underline-offset-4"
          >
            {t("pages.viewPage")}
            <ExternalLinkIcon aria-hidden className="size-4" />
          </a>
        ) : null}
      </PageHeader>
      {owner ? null : (
        <p role="status" className="mb-4 rounded-md border p-3 text-sm">
          {t("pages.ownersOnly")}
        </p>
      )}

      <div
        role="tablist"
        aria-label={t("pages.preview")}
        className="mb-4 grid grid-cols-2 gap-1 rounded-md bg-muted p-1 lg:hidden"
      >
        {(["edit", "preview"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={view === tab}
            onClick={() => setView(tab)}
            className={cn(
              "min-h-11 rounded-sm text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              view === tab ? "bg-background shadow-xs" : "text-muted-foreground",
            )}
          >
            {tab === "edit" ? t("pages.editTab") : t("pages.previewTab")}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <save.Form
          method="post"
          {...getFormProps(form)}
          className={cn("grid content-start gap-6", view === "preview" && "hidden lg:grid")}
        >
          <fieldset disabled={!owner} className="grid gap-4">
            <TextField field={fields.title} label={t("pages.titleLabel")} />
            <TextField
              field={fields.slug}
              label={t("pages.slugLabel")}
              autoCapitalize="none"
              description={pageUrl ? t("pages.slugDescription", { url: pageUrl }) : undefined}
            />
            <details className="rounded-md border p-3">
              <summary className="min-h-11 cursor-pointer content-center font-medium">
                {t("pages.seoHeading")}
              </summary>
              <div className="grid gap-4 pt-2">
                <p className="text-sm text-muted-foreground">{t("pages.seoHint")}</p>
                <TextField field={fields.seoTitle} label={t("pages.seoTitleLabel")} />
                <TextField field={fields.seoDescription} label={t("pages.seoDescriptionLabel")} />
              </div>
            </details>
          </fieldset>

          <section aria-labelledby="blocks-heading" className="grid gap-3">
            <div className="grid gap-1">
              <h2 id="blocks-heading" className="text-lg font-semibold">
                {t("pages.blocksHeading")}
              </h2>
              <p className="text-sm text-muted-foreground">{t("pages.blocksIntro")}</p>
            </div>
            <input
              type="hidden"
              id={fields.blocks.id}
              name={fields.blocks.name}
              value={JSON.stringify(blocks)}
            />
            <FieldErrors id={fields.blocks.errorId} errors={fields.blocks.errors} />
            <BlockEditor
              blocks={blocks}
              onChange={changeBlocks}
              collections={collections}
              disabled={!owner}
              uploading={upload.state !== "idle" ? String(upload.formData?.get("blockId")) : null}
              uploadFailed={uploaded && !uploaded.url ? (uploaded.blockId ?? null) : null}
              onUpload={(blockId, file) => {
                const body = new FormData();
                body.set("intent", "upload");
                body.set("blockId", blockId);
                body.set("file", file);
                upload.submit(body, { method: "post", encType: "multipart/form-data" });
              }}
            />
          </section>

          {owner ? (
            <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-10 -mx-4 grid gap-2 border-t bg-background px-4 py-3 md:bottom-0 md:mx-0 md:px-0">
              <p role="status" className="text-center text-sm text-muted-foreground lg:text-left">
                {dirty && !saving && !saveResult?.done
                  ? t("pages.unsaved")
                  : saveResult?.done && !saving
                    ? published && pageUrl
                      ? t("pages.publishedNotice", { url: pageUrl })
                      : t("pages.saved")
                    : ""}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="submit"
                  name="intent"
                  value="draft"
                  variant="outline"
                  disabled={saving}
                  onClick={() => setDirty(false)}
                >
                  {published ? t("pages.unpublish") : t("pages.saveDraft")}
                </Button>
                <Button
                  type="submit"
                  name="intent"
                  value="publish"
                  disabled={saving}
                  onClick={() => setDirty(false)}
                >
                  {published ? t("pages.saveChanges") : t("pages.publish")}
                </Button>
              </div>
            </div>
          ) : null}
        </save.Form>

        <section
          aria-label={t("pages.preview")}
          className={cn(
            "content-start rounded-md border p-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto",
            view === "edit" && "hidden lg:block",
          )}
        >
          <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("pages.preview")}
          </p>
          <div className="grid gap-6">
            <p aria-hidden className="text-2xl font-semibold tracking-tight">
              {fields.title.value || page.title}
            </p>
            <PageBlocks
              blocks={blocks}
              products={products}
              currency={currency}
              emptyHint={t("pages.emptyBlock")}
            />
          </div>
        </section>
      </div>

      {owner ? (
        <remove.Form
          method="post"
          className="mt-8 border-t pt-6"
          onSubmit={(event) => {
            if (!window.confirm(t("pages.deleteConfirm", { title: page.title }))) {
              event.preventDefault();
            }
          }}
        >
          <Button type="submit" name="intent" value="delete" variant="destructive">
            {t("pages.deletePage")}
          </Button>
        </remove.Form>
      ) : null}
    </>
  );
}
