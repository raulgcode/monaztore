import { appHost } from "@monaztore/env/project";

/**
 * Hosts whose forms may post to the web's actions (`allowedActionOrigins` in
 * react-router.config.ts). Fly's proxy ends HTTPS and hands the server plain HTTP, and
 * react-router-serve doesn't trust X-Forwarded-Proto, so `request.url` reads `http://…` while the
 * browser sends `Origin: https://…`: without these hosts React Router's CSRF check answers every
 * POST with 400. It is the host of APP_URL in fly.web.toml (the config is read at build time,
 * before that variable exists); `pnpm start project` sets it.
 */
export const actionOrigins = [appHost];
