import { data } from "react-router";

// Local development tools (/dev/sign-in). Three locks keep them out of production: routes.ts
// only registers them outside production builds, `import.meta.env.DEV` is false in any build,
// and the request must come to localhost (not through a tunnel to the dev server).

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLocalRequest(request: Request): boolean {
  return localHosts.has(new URL(request.url).hostname);
}

/** 404 unless this is `pnpm dev` answering a request on localhost. */
export function requireDevTools(request: Request, dev: boolean = import.meta.env.DEV): void {
  if (!dev || !isLocalRequest(request)) throw data("Page not found", { status: 404 });
}
