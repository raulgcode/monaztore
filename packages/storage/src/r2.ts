import { AwsClient } from "aws4fetch";
import { assertKey, type FileStore } from "./store";

export interface R2Credentials {
  accountId: string;
  /** The S3 pair of an R2 API token with Object Read & Write on the bucket. */
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/** `attachment` with the name in ASCII and, for accents, in UTF-8 (RFC 6266). */
export function contentDisposition(fileName: string): string {
  const ascii = fileName
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/["\\]/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * A private Cloudflare R2 bucket, through its S3-compatible API. Nothing is public: the app
 * reads every file with the token and serves what it draws from it.
 */
export function r2FileStore(
  { accountId, accessKeyId, secretAccessKey, bucket }: R2Credentials,
  { fetch = globalThis.fetch }: { fetch?: typeof globalThis.fetch } = {},
): FileStore & Required<Pick<FileStore, "signedUrl">> {
  const client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}`;

  const send = async (method: "PUT" | "GET" | "DELETE", key: string, init: RequestInit = {}) => {
    assertKey(key);
    const request = await client.sign(`${endpoint}/${key}`, { ...init, method });
    return fetch(request);
  };
  const fail = async (response: Response, action: string, key: string) =>
    new Error(`R2 ${action} ${key} failed: ${response.status} ${await response.text()}`);

  return {
    kind: "r2",
    async put(key, body, contentType) {
      const response = await send("PUT", key, {
        body: body as Uint8Array<ArrayBuffer>,
        headers: { "Content-Type": contentType },
      });
      if (!response.ok) throw await fail(response, "PUT", key);
    },
    async get(key) {
      const response = await send("GET", key);
      if (response.status === 404) return null;
      if (!response.ok) throw await fail(response, "GET", key);
      return Buffer.from(await response.arrayBuffer());
    },
    async delete(key) {
      const response = await send("DELETE", key);
      // S3 answers 204 whether or not the key existed.
      if (!response.ok && response.status !== 404) throw await fail(response, "DELETE", key);
    },
    async signedUrl(key, { expiresInSeconds, fileName }) {
      assertKey(key);
      const url = new URL(`${endpoint}/${key}`);
      url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
      url.searchParams.set("response-content-disposition", contentDisposition(fileName));
      const request = await client.sign(url.toString(), {
        method: "GET",
        aws: { signQuery: true },
      });
      return request.url;
    },
  };
}
