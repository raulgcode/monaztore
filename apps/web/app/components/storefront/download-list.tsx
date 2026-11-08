import { formatFileSize } from "@monaztore/contracts";
import type { ShopperDownload } from "@monaztore/core";
import { DownloadIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import { useLocale, useT } from "~/lib/i18n";

const refusals = ["not_paid", "expired", "used_up", "not_found"] as const;

/** Why the last download didn't open (`?refused=` from the file's route). */
export function RefusedDownload({ reason }: { reason: string | null }) {
  const t = useT();
  const known = refusals.find((refusal) => refusal === reason);
  if (!known) return null;
  return (
    <p role="alert" className="rounded-md border border-destructive p-3 text-sm">
      {t(`storefront.downloadRefused_${known}`)}
    </p>
  );
}

/**
 * An order's files: a big button each while it opens, and how many downloads and days are left.
 * Plain links that reload the document: a download is a file, not a page.
 */
export function DownloadList({
  downloads,
  href,
}: {
  downloads: Array<Omit<ShopperDownload, "expiresAt"> & { expiresAt: Date | string | null }>;
  href: (id: string) => string;
}) {
  const t = useT();
  const locale = useLocale();
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "long" });
  return (
    <ul className="grid gap-3">
      {downloads.map((download) => {
        const expiresAt = download.expiresAt ? new Date(download.expiresAt) : null;
        const expired = expiresAt !== null && expiresAt <= new Date();
        const status = expired
          ? t("storefront.downloadsExpired", { date: date.format(expiresAt) })
          : download.remaining === 0
            ? t("storefront.downloadsUsedUp")
            : [
                download.remaining === null
                  ? t("storefront.downloadsUnlimited")
                  : t("storefront.downloadsLeft", { count: download.remaining }),
                expiresAt ? t("storefront.downloadsUntil", { date: date.format(expiresAt) }) : null,
              ]
                .filter(Boolean)
                .join(" ");
        return (
          <li key={download.id} className="grid gap-2 rounded-md border p-3">
            <p className="grid gap-0.5">
              <span className="break-all font-medium">{download.fileName}</span>
              <span className="text-sm text-muted-foreground">
                {formatFileSize(download.size, locale)} · {status}
              </span>
            </p>
            {download.available ? (
              <Button asChild size="lg" className="w-full sm:w-auto sm:justify-self-start">
                <a href={href(download.id)} download>
                  <DownloadIcon aria-hidden />
                  {t("storefront.download", { name: download.fileName })}
                </a>
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
