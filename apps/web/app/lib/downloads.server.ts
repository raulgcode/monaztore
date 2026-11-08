import {
  type DownloadResult,
  type DownloadsLink,
  storeIdentity,
  type TenantContext,
} from "@monaztore/core";
import { downloadsMessage } from "@monaztore/email";
import { defaultLocale, parseLocale } from "@monaztore/i18n";
import { contentDisposition } from "@monaztore/storage";
import { href, redirect } from "react-router";
import { files, mailer } from "./services.server";
import { storeOrigin } from "./store-seo";

/** How long R2's own link to the file works: enough to start the download, not to share it. */
const SIGNED_URL_SECONDS = 5 * 60;

/**
 * A digital product's file for the shopper. With R2 the browser goes straight to the bucket
 * through a link signed for a few minutes, so a big file never passes through our server; on
 * disk we read and send it. A refused one goes back to `back` with the reason, for the page to
 * say why.
 */
export async function downloadResponse(result: DownloadResult, back: string): Promise<Response> {
  const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };
  if (!result.ok) {
    const url = new URL(back, "http://x");
    url.searchParams.set("refused", result.reason);
    return redirect(`${url.pathname}${url.search}`, { headers });
  }
  const { file } = result;
  if (files.signedUrl) {
    const url = await files.signedUrl(file.key, {
      expiresInSeconds: SIGNED_URL_SECONDS,
      fileName: file.fileName,
    });
    return redirect(url, { headers });
  }
  const body = await files.get(file.key);
  if (!body) {
    console.error(`A digital product's file is missing from the store: ${file.key}`);
    throw new Response("Not found", { status: 404 });
  }
  return new Response(new Uint8Array(body), {
    headers: {
      ...headers,
      "Content-Type": file.contentType,
      "Content-Length": String(body.byteLength),
      "Content-Disposition": contentDisposition(file.fileName),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    },
  });
}

/**
 * Emails the buyer the link to their downloads, on the store's main domain. False when it
 * couldn't go out: the order stays paid and the store can send it again from the order.
 */
export async function sendDownloadsEmail(
  tenant: TenantContext,
  link: DownloadsLink,
  requestUrl: string,
): Promise<boolean> {
  const store = await storeIdentity(tenant);
  if (!store.hostname) return false;
  const locale = parseLocale(link.locale) ?? defaultLocale;
  const url = `${storeOrigin(store.hostname, requestUrl)}${href("/downloads/:token", { token: link.token })}`;
  try {
    await mailer.send({
      to: link.email,
      ...downloadsMessage({
        locale,
        storeName: store.name,
        orderNumber: link.number,
        name: link.name,
        url,
        files: link.files,
      }),
    });
    return true;
  } catch (error) {
    console.error(`The downloads email of order #${link.number} didn't go out`, error);
    return false;
  }
}
