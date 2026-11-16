import { pageSlugOf } from "@monaztore/contracts";
import {
  createPage,
  DomainError,
  getStoreInfo,
  getThemeSettings,
  listPages,
  setHomePage,
} from "@monaztore/core";
import { FileTextIcon, GiftIcon, HomeIcon, PlusIcon } from "lucide-react";
import { data, Form, href, Link, redirect, useFetcher, useNavigation } from "react-router";
import { PageHeader } from "~/components/page-header";
import { Button } from "~/components/ui/button";
import { tenantContext } from "~/context";
import { metaT, useLocale, useT } from "~/lib/i18n";
import { serverT, translations } from "~/lib/locale.server";
import { pageTemplate, readPageTemplate } from "~/lib/page-templates.server";
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

/**
 * "New page" (blank or from a template), opened in the editor as a draft; or which page the
 * store opens with. A front page from its template becomes the front page at once: until it's
 * published the store keeps showing Design's.
 */
export async function action({ request, params, context }: Route.ActionArgs) {
  const tenant = context.get(tenantContext);
  if (tenant.role !== "owner") throw data("Only owners create pages", { status: 403 });
  const formData = await request.formData();
  if (formData.get("intent") === "home") {
    const id = String(formData.get("pageId") ?? "");
    await setHomePage(tenant, id || null);
    return { ok: true };
  }
  const template = readPageTemplate(formData.get("template"));
  const [theme, info] = await Promise.all([
    getThemeSettings(tenant),
    getStoreInfo({
      db: tenant.db,
      store: { organizationId: tenant.organizationId, name: "", slug: "", hostname: "" },
    }),
  ]);
  const { title, slug, blocks } = pageTemplate(template, serverT(context), theme, info.name);
  const base = slug || pageSlugOf(title) || "page";
  for (let n = 1; n < 50; n++) {
    try {
      const { id } = await createPage(tenant, {
        title,
        slug: n === 1 ? base : `${base}-${n}`,
        seoTitle: "",
        seoDescription: "",
        status: "draft",
        blocks,
      });
      if (template === "front") await setHomePage(tenant, id);
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
      <HomeNotice pages={pages} />
      {pages.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-muted-foreground">
          {t("pages.empty")}
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {pages.map((page) => (
            <li key={page.id} className="flex flex-wrap items-center gap-x-2">
              <Link
                to={href("/app/:workspace/pages/:pageId", {
                  workspace: params.workspace,
                  pageId: page.id,
                })}
                className="flex min-h-14 min-w-0 flex-1 basis-64 items-center gap-3 px-4 py-3 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {page.isHome ? (
                  <HomeIcon aria-hidden className="size-5 shrink-0 text-primary" />
                ) : (
                  <FileTextIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                )}
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate font-medium">{page.title}</span>
                  <span className="truncate text-sm text-muted-foreground">
                    {page.isHome ? `${t("pages.homeBadge")} · ` : `/${page.slug} · `}
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
              {owner ? <HomeToggle page={page} /> : null}
            </li>
          ))}
        </ul>
      )}
      {owner ? (
        <section aria-labelledby="templates" className="mt-8 grid gap-3">
          <h2 id="templates" className="text-lg font-semibold">
            {t("pages.templatesHeading")}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["front", HomeIcon, "pages.templateFront", "pages.templateFrontHint"],
                ["custom", GiftIcon, "pages.templateCustom", "pages.templateCustomHint"],
              ] as const
            ).map(([template, Icon, label, hint]) => (
              <li key={template} className="grid">
                <Form method="post" className="grid gap-3 rounded-xl border bg-card p-4">
                  <span className="flex items-center gap-2 font-medium">
                    <Icon aria-hidden className="size-5 text-primary" />
                    {t(label)}
                  </span>
                  <span className="text-sm text-muted-foreground">{t(hint)}</span>
                  <Button
                    type="submit"
                    name="template"
                    value={template}
                    variant="outline"
                    className="justify-self-start"
                    aria-label={`${t("pages.useTemplate")}: ${t(label)}`}
                    disabled={navigation.state !== "idle"}
                  >
                    {t("pages.useTemplate")}
                  </Button>
                </Form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

type PageRow = Route.ComponentProps["loaderData"]["pages"][number];

/** Which page the store opens with, said in words. */
function HomeNotice({ pages }: { pages: PageRow[] }) {
  const t = useT();
  const home = pages.find((page) => page.isHome);
  return (
    <p role="status" className="mb-4 rounded-md border bg-card p-3 text-sm">
      {home
        ? home.status === "published"
          ? t("pages.homeNotice", { title: home.title })
          : t("pages.homeDraftNotice", { title: home.title })
        : t("pages.homeNone")}
    </p>
  );
}

function HomeToggle({ page }: { page: PageRow }) {
  const t = useT();
  const fetcher = useFetcher();
  return (
    <fetcher.Form method="post" className="px-4 pb-3 sm:pb-0">
      <input type="hidden" name="intent" value="home" />
      <input type="hidden" name="pageId" value={page.isHome ? "" : page.id} />
      <Button
        type="submit"
        variant="ghost"
        className="min-h-11"
        disabled={fetcher.state !== "idle"}
      >
        {page.isHome ? t("pages.unsetHome") : t("pages.makeHome")}
        <span className="sr-only">: {page.title}</span>
      </Button>
    </fetcher.Form>
  );
}
