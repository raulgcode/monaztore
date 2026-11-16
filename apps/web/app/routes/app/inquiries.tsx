import { readInquiryStatus, whatsappLink } from "@monaztore/contracts";
import {
  deleteInquiry,
  getWorkspace,
  INQUIRIES_PAGE_SIZE,
  type InquiryRow,
  listInquiries,
  NotFoundError,
  setInquiryStatus,
} from "@monaztore/core";
import { CheckIcon, MailIcon, MessageCircleIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { data, href, Link, useFetcher } from "react-router";
import { PageHeader } from "~/components/page-header";
import { Button, buttonVariants } from "~/components/ui/button";
import { tenantContext } from "~/context";
import { metaT, useLocale, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/inquiries";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("inquiries.title") }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = context.get(tenantContext);
  const url = new URL(request.url);
  const status = readInquiryStatus(url.searchParams.get("status"));
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const [list, workspace] = await Promise.all([
    listInquiries(tenant, { status, page }),
    getWorkspace(tenant),
  ]);
  return {
    ...list,
    status,
    page,
    pages: Math.max(1, Math.ceil(list.total / INQUIRIES_PAGE_SIZE)),
    storeName: workspace.name,
    i18n: translations(context, "inquiries"),
  };
}

/** Marks a request answered (or back to answer), or deletes it. Anyone on the team. */
export async function action({ request, context }: Route.ActionArgs) {
  const tenant = context.get(tenantContext);
  const formData = await request.formData();
  const id = String(formData.get("id") ?? "");
  const intent = formData.get("intent");
  if (intent !== "delete" && intent !== "done" && intent !== "new") {
    throw data("Unknown intent", { status: 400 });
  }
  try {
    if (intent === "delete") await deleteInquiry(tenant, id);
    else await setInquiryStatus(tenant, id, intent);
  } catch (error) {
    // Someone else's request answers like one that doesn't exist.
    if (error instanceof NotFoundError) throw data("Request not found", { status: 404 });
    throw error;
  }
  return { ok: true };
}

export default function Inquiries({ loaderData, params }: Route.ComponentProps) {
  const t = useT();
  const { inquiries, counts, status, page, pages, storeName } = loaderData;
  const link = (next: { status?: string; page?: number }) => {
    const search = new URLSearchParams();
    const nextStatus = next.status ?? status;
    if (nextStatus !== "new") search.set("status", nextStatus);
    if (next.page && next.page > 1) search.set("page", String(next.page));
    const query = search.toString();
    return `${href("/app/:workspace/inquiries", { workspace: params.workspace })}${query ? `?${query}` : ""}`;
  };
  const tabs = [
    { key: "new", label: t("inquiries.tabNew"), count: counts.new },
    { key: "done", label: t("inquiries.tabDone"), count: counts.done },
    { key: "all", label: t("inquiries.tabAll"), count: counts.new + counts.done },
  ] as const;

  return (
    <>
      <PageHeader title={t("inquiries.title")} description={t("inquiries.intro")} />
      <nav aria-label={t("inquiries.tabsLabel")} className="mb-4">
        <ul className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <li key={tab.key}>
              <Link
                to={link({ status: tab.key, page: 1 })}
                aria-current={status === tab.key ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  status === tab.key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-accent",
                )}
              >
                {tab.label}
                <span className="tabular-nums">{tab.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {inquiries.length === 0 ? (
        <p role="status" className="rounded-md border p-6 text-center text-muted-foreground">
          {status === "done" ? t("inquiries.emptyDone") : t("inquiries.empty")}
        </p>
      ) : (
        <ul className="grid gap-3">
          {inquiries.map((inquiry) => (
            <InquiryCard key={inquiry.id} inquiry={inquiry} storeName={storeName} />
          ))}
        </ul>
      )}
      {pages > 1 ? (
        <nav className="mt-4 flex items-center justify-between gap-2">
          {page > 1 ? (
            <Link to={link({ page: page - 1 })} className={buttonVariants({ variant: "outline" })}>
              {t("inquiries.previous")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">
            {t("inquiries.pageOf", { page: String(page), pages: String(pages) })}
          </span>
          {page < pages ? (
            <Link to={link({ page: page + 1 })} className={buttonVariants({ variant: "outline" })}>
              {t("inquiries.next")}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}

function InquiryCard({
  inquiry,
  storeName,
}: {
  inquiry: Omit<InquiryRow, "createdAt"> & { createdAt: Date | string };
  storeName: string;
}) {
  const t = useT();
  const locale = useLocale();
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";
  const done = (fetcher.formData?.get("intent") ?? inquiry.status) === "done";
  const chat = inquiry.phone ? whatsappLink(inquiry.phone) : null;
  const mail = `mailto:${inquiry.email}?subject=${encodeURIComponent(
    t("inquiries.replySubject", { store: storeName }),
  )}`;
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(inquiry.createdAt),
  );
  if (fetcher.formData?.get("intent") === "delete") return null;
  return (
    <li className={cn("grid gap-3 rounded-lg border bg-card p-4", done && "opacity-80")}>
      <div className="grid gap-0.5">
        <p className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-semibold">{inquiry.name}</span>
          <time
            dateTime={new Date(inquiry.createdAt).toISOString()}
            className="text-sm text-muted-foreground"
          >
            {when}
          </time>
        </p>
        <p className="text-sm break-all text-muted-foreground">
          {[inquiry.email, inquiry.phone].filter(Boolean).join(" · ")}
        </p>
        {inquiry.pageTitle ? (
          <p className="text-sm text-muted-foreground">
            {t("inquiries.from", { page: inquiry.pageTitle })}
          </p>
        ) : null}
      </div>
      <p className="whitespace-pre-line">{inquiry.message}</p>
      <div className="flex flex-wrap gap-2">
        {chat ? (
          <a
            href={`${chat}?text=${encodeURIComponent(
              t("inquiries.replySubject", { store: storeName }),
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({
              className: "bg-whatsapp text-whatsapp-foreground hover:bg-whatsapp/90",
            })}
          >
            <MessageCircleIcon aria-hidden />
            {t("inquiries.whatsapp")}
          </a>
        ) : null}
        <a href={mail} className={buttonVariants({ variant: "outline" })}>
          <MailIcon aria-hidden />
          {t("inquiries.email")}
        </a>
        <fetcher.Form method="post" className="contents">
          <input type="hidden" name="id" value={inquiry.id} />
          {done ? (
            <Button type="submit" name="intent" value="new" variant="ghost" disabled={busy}>
              <RotateCcwIcon aria-hidden />
              {t("inquiries.markNew")}
            </Button>
          ) : (
            <Button type="submit" name="intent" value="done" variant="outline" disabled={busy}>
              <CheckIcon aria-hidden />
              {t("inquiries.markDone")}
            </Button>
          )}
          <Button
            type="submit"
            name="intent"
            value="delete"
            variant="ghost"
            disabled={busy}
            aria-label={`${t("inquiries.remove")}: ${inquiry.name}`}
            onClick={(event) => {
              if (!window.confirm(t("inquiries.removeConfirm", { name: inquiry.name }))) {
                event.preventDefault();
              }
            }}
          >
            <Trash2Icon aria-hidden />
            {t("inquiries.remove")}
          </Button>
        </fetcher.Form>
      </div>
    </li>
  );
}
