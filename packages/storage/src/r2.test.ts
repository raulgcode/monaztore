import { describe, expect, it } from "vitest";
import { contentDisposition, r2FileStore } from "./r2";

const credentials = {
  accountId: "acc123",
  accessKeyId: "AKID",
  secretAccessKey: "secret",
  bucket: "monaztore-files",
};

/** A fake R2 that records each request and answers from a map. */
function fakeR2() {
  const objects = new Map<string, Buffer>();
  const requests: Request[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(request);
    const key = new URL(request.url).pathname;
    if (request.method === "PUT") {
      objects.set(key, Buffer.from(await request.arrayBuffer()));
      return new Response(null, { status: 200 });
    }
    if (request.method === "DELETE") {
      objects.delete(key);
      return new Response(null, { status: 204 });
    }
    const body = objects.get(key);
    return body ? new Response(new Uint8Array(body)) : new Response("NoSuchKey", { status: 404 });
  };
  return { fetch: fetch as typeof globalThis.fetch, requests };
}

describe("r2FileStore", () => {
  it("puts, gets and deletes objects in the bucket with signed requests", async () => {
    const r2 = fakeR2();
    const store = r2FileStore(credentials, { fetch: r2.fetch });

    await store.put("organizations/o1/logo.png", new Uint8Array([1, 2, 3]), "image/png");
    const [put] = r2.requests;
    expect(put?.url).toBe(
      "https://acc123.r2.cloudflarestorage.com/monaztore-files/organizations/o1/logo.png",
    );
    expect(put?.headers.get("content-type")).toBe("image/png");
    expect(put?.headers.get("authorization")).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKID\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=.*, Signature=[0-9a-f]{64}$/,
    );

    expect([...((await store.get("organizations/o1/logo.png")) ?? [])]).toEqual([1, 2, 3]);
    await store.delete("organizations/o1/logo.png");
    expect(await store.get("organizations/o1/logo.png")).toBeNull();
  });

  it("refuses unsafe keys before calling R2", async () => {
    const r2 = fakeR2();
    const store = r2FileStore(credentials, { fetch: r2.fetch });
    await expect(store.get("../other-bucket/x")).rejects.toThrow(/Invalid file key/);
    expect(r2.requests).toHaveLength(0);
  });

  it("throws on an R2 error", async () => {
    const fetch = (async () =>
      new Response("AccessDenied", { status: 403 })) as unknown as typeof globalThis.fetch;
    const store = r2FileStore(credentials, { fetch });
    await expect(store.get("a.png")).rejects.toThrow(/R2 GET a.png failed: 403 AccessDenied/);
  });

  it("signs a download URL that expires and saves the file under its name", async () => {
    const r2 = fakeR2();
    const store = r2FileStore(credentials, { fetch: r2.fetch });
    const url = new URL(
      await store.signedUrl("organizations/o1/exports/e1.xlsx", {
        expiresInSeconds: 300,
        fileName: "clientes-café.xlsx",
      }),
    );
    expect(url.origin + url.pathname).toBe(
      "https://acc123.r2.cloudflarestorage.com/monaztore-files/organizations/o1/exports/e1.xlsx",
    );
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.get("response-content-disposition")).toBe(
      contentDisposition("clientes-café.xlsx"),
    );
    // Signing is local: nothing reaches R2 until the browser follows the URL.
    expect(r2.requests).toHaveLength(0);
  });
});

describe("contentDisposition", () => {
  it("gives the name in ASCII and, with accents, in UTF-8 too", () => {
    expect(contentDisposition('clientes "café".csv')).toBe(
      "attachment; filename=\"clientes cafe.csv\"; filename*=UTF-8''clientes%20%22caf%C3%A9%22.csv",
    );
  });
});
