# One image for both Fly apps (fly.web.toml and fly.api.toml): the whole workspace with its
# dependencies and the web build. Each app starts its own process; the API runs its TypeScript
# with tsx, as the workspace packages export their sources.
FROM node:24-slim

ENV CI=true \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    LEFTHOOK=0
RUN corepack enable
WORKDIR /app

# Dependencies first: this layer is reused while the lockfile doesn't change.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN corepack install && pnpm fetch

COPY . .
RUN pnpm install --frozen-lockfile --offline \
  && pnpm --filter @monaztore/web build

ENV NODE_ENV=production
# Each app sets its own process in its fly.*.toml; this one is the web's, for `docker run`.
WORKDIR /app/apps/web
CMD ["node_modules/.bin/react-router-serve", "build/server/index.js"]
