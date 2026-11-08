import type { PasskeyRelyingParty } from "@monaztore/core";
import { project } from "@monaztore/env/project";
import { env } from "./services.server";

/**
 * The panel and /admin live on APP_URL: their passkeys belong to that host and only work
 * there. On localhost too, since browsers treat it as a secure origin.
 */
export const passkeyParty: PasskeyRelyingParty = (() => {
  const url = new URL(env.APP_URL);
  return { id: url.hostname, origin: url.origin, name: project.name };
})();
