import { pageSlugOf } from "@monaztore/contracts";
import { createPage, DomainError, listPages } from "@monaztore/core";
import { FileTextIcon, PlusIcon } from "lucide-react";
import { data, Form, href, Link, redirect, useNavigation } from "react-router";
import { PageHeader } from "~/components/page-header";
import { Button } from "~/components/ui/button";
import { tenantContext } from "~/context";
import { metaT, useLocale, useT } from "~/lib/i18n";
import { serverT, translations } from "~/lib/locale.server";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/pages";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("pages.title") }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const tenant = context.get(tenantContext);
  return {
    pages: await listPages(tenant),
    owner: tenant.role === "owner",
    i18n: translations(context, "pages"),
  };
}

/** "New page": a draft that starts with a heading and a text, opened in the editor. */
export async function action({ params, context }: Route.ActionArgs) {
  const tenant = context.get(tenantContext);
  if (tenant.role !== "owner") throw data("Only owners create pages", { status: 403 });
  const title = serverT(context)("pages.newPageTitle");
  const base = pageSlugOf(title) || "page";
  for (let n = 1; n < 50; n++) {
    try {
      const { id } = await createPage(tenant, {
        title,
        slug: n === 1 ? base : `${base}-${n}`,
        seoTitle: "",
        seoDescription: "",
        status: "draft",
        blocks: [
          { type: "heading", id: "b1", text: "", level: 2 },
          { type: "text", id: "b2", html: "" },
        ],
      });
      throw redirect(
        href("/app/:workspace/pages/:pageId", { workspace: params.workspace, pageId: id }),
      );
    } catch (error) {
      if (!(error instanceof DomainError && error.code === "slug_taken")) throw error;
    }
  }
  throw data("No free address for a new page", { status: 409 });
}

export default function Pages({ loaderData, params }: Route.ComponentProps) {
  const t = useT();
  const locale = useLocale();
  const navigation = useNavigation();
  const { pages, owner } = loaderData;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <>
      <PageHeader title={t("pages.title")} description={t("pages.intro")}>
        {owner ? (
          <Form method="post" className="w-full sm:w-auto">
            <Button type="submit" className="w-full" disabled={navigation.state !== "idle"}>
              <PlusIcon aria-hidden />
              {t("pages.newPage")}
            </Button>
          </Form>
        ) : null}
      </PageHeader>
      {owner ? null : (
        <p role="status" className="mb-4 rounded-md border p-3 text-sm">
          {t("pages.ownersOnly")}
        </p>
      )}
      {pages.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-muted-foreground">
          {t("pages.empty")}
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {pages.map((page) => (
            <li key={page.id}>
              <Link
                to={href("/app/:workspace/pages/:pageId", {
                  workspace: params.workspace,
                  pageId: page.id,
                })}
                className="flex min-h-14 items-center gap-3 px-4 py-3 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <FileTextIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate font-medium">{page.title}</span>
                  <span className="truncate text-sm text-muted-foreground">
                    /{page.slug} ·{" "}
                    {t("pages.updated", { date: date.format(new Date(page.updatedAt)) })}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                    page.status === "published"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {page.status === "published" ? t("pages.published") : t("pages.draft")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
