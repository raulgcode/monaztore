export type Fetch = typeof fetch;

export interface WooCommerceConnection {
  /** The shop's address, e.g. https://supechivacr.com */
  url: string;
  /** WooCommerce → Settings → Advanced → REST API, read permission. Without them, the Store API. */
  consumerKey?: string;
  consumerSecret?: string;
  fetch?: Fetch;
  /** Items per page; WooCommerce allows up to 100. */
  perPage?: number;
}

export class WooCommerceError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = "WooCommerceError";
  }
}

/** Reads a WooCommerce shop over HTTP: REST API v3 with keys, the public Store API without. */
export class WooCommerceClient {
  readonly base: URL;
  private readonly fetch: Fetch;
  private readonly perPage: number;
  private readonly auth: string | undefined;

  constructor({
    url,
    consumerKey,
    consumerSecret,
    fetch: fetcher,
    perPage = 100,
  }: WooCommerceConnection) {
    this.base = new URL(url.endsWith("/") ? url : `${url}/`);
    if (this.base.protocol !== "https:" && this.base.hostname !== "localhost" && consumerKey) {
      throw new Error("The keys only travel over HTTPS: use the shop's https:// address");
    }
    this.fetch = fetcher ?? fetch;
    this.perPage = perPage;
    this.auth =
      consumerKey && consumerSecret
        ? `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64")}`
        : undefined;
  }

  get authenticated(): boolean {
    return this.auth !== undefined;
  }

  private url(path: string, query: Record<string, string | number> = {}): URL {
    const url = new URL(`wp-json/${path}`, this.base);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    return url;
  }

  async get<T>(
    path: string,
    query: Record<string, string | number> = {},
  ): Promise<{ data: T; totalPages: number }> {
    const url = this.url(path, query);
    const response = await this.fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "Monaztore-Importer/1.0",
        ...(this.auth ? { authorization: this.auth } : {}),
      },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const hint =
        response.status === 401 || response.status === 403
          ? " (check the key has read permission and the site allows the REST API)"
          : response.status === 404
            ? " (is WooCommerce installed and are permalinks enabled?)"
            : "";
      throw new WooCommerceError(
        response.status,
        path,
        `WooCommerce answered ${response.status} for ${url.pathname}${hint}: ${body.slice(0, 200)}`,
      );
    }
    const totalPages = Number(response.headers.get("x-wp-totalpages") ?? "1") || 1;
    return { data: (await response.json()) as T, totalPages };
  }

  /** Every page of a list endpoint, in order. */
  async all<T>(path: string, query: Record<string, string | number> = {}): Promise<T[]> {
    const items: T[] = [];
    for (let page = 1; ; page++) {
      const { data, totalPages } = await this.get<T[]>(path, {
        per_page: this.perPage,
        ...query,
        page,
      });
      items.push(...data);
      if (page >= totalPages || data.length === 0) return items;
    }
  }
}
