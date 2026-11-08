import type { EinvoiceRow } from "@monaztore/core";
import { href } from "react-router";
import { useT } from "~/lib/i18n";
import { cn } from "~/lib/utils";

/** A document's state as a small label; the ones that need the store stand out. */
export function EinvoiceStatusBadge({ status }: { status: EinvoiceRow["status"] }) {
  const t = useT();
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
        (status === "rejected" || status === "failed") &&
          "border-destructive bg-destructive text-destructive-foreground",
        status === "accepted" && "border-primary bg-primary text-primary-foreground",
      )}
    >
      {t(`einvoicing.status_${status}`)}
    </span>
  );
}

/** Why a document needs the store, in words, or null when it doesn't. */
export function EinvoiceProblem({ einvoice }: { einvoice: EinvoiceRow }) {
  const t = useT();
  if (!einvoice.problem) return null;
  const reason = einvoice.message ?? "";
  const text =
    einvoice.problem === "rejected"
      ? reason
        ? t("einvoicing.problem_rejected", { reason })
        : t("einvoicing.problem_rejectedNoReason")
      : einvoice.problem === "invalid"
        ? t("einvoicing.problem_invalid", { reason })
        : t(`einvoicing.problem_${einvoice.problem}`);
  return (
    <p role="alert" className="text-sm text-destructive">
      {text}
    </p>
  );
}

/** Links to download the signed XML and Hacienda's answer from the workspace. */
export function EinvoiceDownloads({
  workspace,
  einvoice,
}: {
  workspace: string;
  einvoice: EinvoiceRow;
}) {
  const t = useT();
  if (!einvoice.hasDocument) return null;
  const link = "inline-flex min-h-11 items-center text-sm underline underline-offset-4";
  return (
    <div className="flex flex-wrap gap-x-4">
      <a
        className={link}
        href={href("/app/:workspace/invoicing/:id/:file", {
          workspace,
          id: einvoice.id,
          file: "document.xml",
        })}
      >
        {t("einvoicing.downloadXml")}
      </a>
      {einvoice.hasResponse ? (
        <a
          className={link}
          href={href("/app/:workspace/invoicing/:id/:file", {
            workspace,
            id: einvoice.id,
            file: "response.xml",
          })}
        >
          {t("einvoicing.downloadResponse")}
        </a>
      ) : null}
    </div>
  );
}
