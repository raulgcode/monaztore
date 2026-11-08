import { randomBytes } from "node:crypto";
import { data, type MiddlewareFunction } from "react-router";
import { nonceContext } from "~/context";
import { bodySizeProblem } from "~/lib/request-limits";
import { securityHeaders } from "~/lib/security-headers";
import { env } from "~/lib/services.server";

const https = env.APP_URL.startsWith("https://");

/**
 * First in root.tsx: refuses bodies it can't measure or that are too big, gives the page a
 * nonce for its scripts (entry.server.tsx renders with it) and adds the security headers to
 * every response, pages and resource routes alike.
 */
export const securityMiddleware: MiddlewareFunction<Response> = async (
  { request, context },
  next,
) => {
  const problem = bodySizeProblem(request);
  if (problem === 411) throw data("Send the body with a Content-Length", { status: 411 });
  if (problem === 413) throw data("The request is too big", { status: 413 });

  const nonce = randomBytes(16).toString("base64");
  context.set(nonceContext, nonce);
  const response = await next();
  const { pathname } = new URL(request.url);
  try {
    for (const [name, value] of securityHeaders({
      nonce,
      production: !import.meta.env.DEV,
      https,
      pathname,
    })) {
      response.headers.set(name, value);
    }
  } catch {
    // Immutable headers (a fetched Response): nothing to add.
  }
  return response;
};
