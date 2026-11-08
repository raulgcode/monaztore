/** The biggest body we take: a 5 MB upload plus its form envelope. Raise it only with a reason. */
export const MAX_REQUEST_BYTES = 6 * 1024 * 1024;

/**
 * A digital product's file (`/app/<workspace>/downloads/…`): up to 50 MB plus a cover photo and
 * the form. Only there, for an owner signed in; everything else keeps the 6 MB.
 */
export const DIGITAL_UPLOAD_REQUEST_BYTES = 56 * 1024 * 1024;

/** The biggest body a path takes. */
export function maxRequestBytes(pathname: string): number {
  return /^\/app\/[^/]+\/downloads(\/|$)/.test(pathname)
    ? DIGITAL_UPLOAD_REQUEST_BYTES
    : MAX_REQUEST_BYTES;
}

const withBody = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Whether the request's body may be read: 411 for a body without a declared length (chunked,
 * which no browser form sends and which would get past every size check), 413 when it says
 * it is bigger than `max`. Node stops reading at Content-Length, so the declared size holds.
 */
export function bodySizeProblem(
  request: Pick<Request, "method" | "headers">,
  max: number = MAX_REQUEST_BYTES,
): 411 | 413 | undefined {
  if (!withBody.has(request.method.toUpperCase())) return undefined;
  const length = request.headers.get("Content-Length");
  if (length === null) return request.headers.has("Transfer-Encoding") ? 411 : undefined;
  const bytes = Number(length);
  if (!Number.isSafeInteger(bytes) || bytes < 0) return 411;
  return bytes > max ? 413 : undefined;
}
