import { findProductsWithoutFiles, listDigitalProducts, storeCurrency } from "@monaztore/core";
import { DownloadIcon, PlusIcon, SearchIcon } from "lucide-react";
import { Form, href, Link } from "react-router";
import { PageHeader } from "~/components/page-header";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { tenantContext } from "~/context";
import { metaT, useLocale, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { formatPrice } from "~/lib/money";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/digital-products";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("digital.title") }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = context.get(tenantContext);
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  const owner = tenant.role === "owner";
  const [products, currency, found] = await Promise.all([
    listDigitalProducts(tenant),
    storeCurrency(tenant),
    owner && q ? findProductsWithoutFiles(tenant, q) : Promise.resolve(null),
  ]);
  return { products, currency, q, found, owner, i18n: translations(context, "digital") };
}

export default function DigitalProducts({ loaderData, params }: Route.ComponentProps) {
  const t = useT();
  const locale = useLocale();
  const { products, currency, q, found, owner } = loaderData;
  const productHref = (productId: string) =>
    href("/app/:workspace/downloads/:productId", { workspace: params.workspace, productId });

  return (
    <>
      <PageHeader title={t("digital.title")} description={t("digital.intro")}>
        {owner ? (
          <Button asChild className="w-full sm:w-auto">
            <Link to={href("/app/:workspace/downloads/new", { workspace: params.workspace })}>
              <PlusIcon aria-hidden />
              {t("digital.newProduct")}
            </Link>
          </Button>
        ) : null}
      </PageHeader>
      {owner ? null : (
        <p role="status" className="mb-4 rounded-md border p-3 text-sm">
          {t("digital.ownersOnly")}
        </p>
      )}

      {products.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-muted-foreground">
          {t("digital.empty")}
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {products.map((product) => (
            <li key={product.id}>
              <Link
                to={productHref(product.id)}
                className="flex min-h-14 items-center gap-3 px-4 py-3 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <DownloadIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate font-medium">{product.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {[
                      product.price === null ? null : formatPrice(product.price, currency, locale),
                      t("digital.filesCount", { count: product.files }),
                      product.downloadLimit === null
                        ? t("digital.downloadsUnlimited")
                        : t("digital.downloadsEach", { count: product.downloadLimit }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <StatusLabel status={product.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {owner ? (
        <section aria-labelledby="existing" className="mt-8 grid gap-3">
          <div className="grid gap-1">
            <h2 id="existing" className="text-lg font-semibold">
              {t("digital.existingHeading")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("digital.existingIntro")}</p>
          </div>
          <Form method="get" role="search" className="flex items-end gap-2">
            <div className="grid flex-1 gap-2">
              <Label htmlFor="q">{t("digital.searchLabel")}</Label>
              <Input id="q" name="q" type="search" defaultValue={q} autoComplete="off" />
            </div>
            <Button type="submit" variant="outline" className="min-w-11">
              <SearchIcon aria-hidden />
              <span className="sr-only sm:not-sr-only">{t("digital.search")}</span>
            </Button>
          </Form>
          {found === null ? null : found.length === 0 ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t("digital.noResults")}
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {found.map((product) => (
                <li key={product.id}>
                  <Link
                    to={productHref(product.id)}
                    className="flex min-h-12 items-center justify-between gap-3 px-4 py-2 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <span className="truncate">{product.name}</span>
                    <StatusLabel status={product.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </>
  );
}

function StatusLabel({ status }: { status: string }) {
  const t = useT();
  const active = status === "active";
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {active
        ? t("digital.onSale")
        : status === "draft"
          ? t("digital.draft")
          : t("digital.archived")}
    </span>
  );
}
