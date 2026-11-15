# Production on Fly.io

Monaztore runs on Fly.io as two apps built from the same image (`Dockerfile`), plus the database:

| What            | Where                                              | Config         |
| --------------- | -------------------------------------------------- | -------------- |
| `monaztore-web` | `app.monaztore.com`: pages, sign-in, the workspace | `fly.web.toml` |
| `monaztore-api` | `api.monaztore.com`: public API and scheduled jobs | `fly.api.toml` |
| Fly Postgres    | `monaztore-db`, same region as the apps (`iad`)    | —              |

The public URLs (`APP_URL`, `API_URL`) and `CLIENT_IP_HEADER` are in `[env]` of each
`fly.*.toml`; everything else is a secret, the same in both apps.

## Once

### 1. Fly

```bash
brew install flyctl
fly auth login
fly apps create monaztore-api --org monaztore
fly apps create monaztore-web --org monaztore
```

If a name is taken, pick another and change it in `app = "…"` of the `fly.*.toml` and in
`APPS` of `tooling/fly-secrets/index.ts`.

### 2. Database

A Postgres of our own on a Fly machine (Fly's "legacy" Postgres, `fly postgres`): one small
machine and a 1 GB volume, about $2 a month. Fly Managed Postgres (`fly mpg`) is the upgrade
when the stores grow: it adds failover and support, from about $38 a month.

```bash
fly postgres create --name monaztore-db --org monaztore --region iad \
  --initial-cluster-size 1 --vm-size shared-cpu-1x --volume-size 1
fly postgres attach monaztore-db -a monaztore-api --database-name monaztore
```

`attach` creates the database and its user and sets `DATABASE_URL` on `monaztore-api`
(`postgres://…@monaztore-db.flycast:5432/monaztore?sslmode=disable`, only reachable inside Fly's
network). Copy it into `.env.production`: the web uses the same one. Print it with
`fly ssh console -a monaztore-api -C 'printenv DATABASE_URL'` after the first deploy, or save
the one `attach` prints. If `iad` isn't available, use another nearby region
(`fly platform regions`) and set the same one in `primary_region` of both `fly.*.toml`.

This Postgres is ours to look after:
- **Backups**: the volume takes a snapshot every day and keeps 5 (`fly volumes snapshots list`).
  Before a big change (an import, the DNS switch) take a dump too:
  `fly proxy 15432:5432 -a monaztore-db` and, in another terminal,
  `pg_dump "postgres://…@localhost:15432/monaztore" -Fc -f monaztore-$(date +%F).dump`.
- **From your machine** (the importer, `psql`): the same `fly proxy`, with `localhost:15432` in
  `DATABASE_URL`.
- **Memory**: 256 MB is enough to start; `fly machine update <id> --vm-memory 512 -a
  monaztore-db` when it isn't.

### 3. Secrets

Build `.env.production` from your `.env` (`.gitignore` keeps it out of git) and change what is
for development:

| Variable               | In production                                                              |
| ---------------------- | -------------------------------------------------------------------------- |
| `DATABASE_URL`         | The URL `fly postgres attach` gave in step 2                               |
| `BETTER_AUTH_SECRET`   | A new one: `openssl rand -base64 32`. Changing it later signs everyone out |
| `AUTH_METHODS`         | The same as in your `.env` (or whichever you want in production)           |
| `SMTP_*`, `EMAIL_FROM` | Your email provider (Resend, Postmark, SES…), with the domain verified     |
| `GOOGLE_*`             | Only with `google`: the same OAuth client as locally                       |

With Google, add the redirect URI `https://app.monaztore.com/api/auth/callback/google` to the
OAuth client.

Check and send:

```bash
pnpm fly:secrets --check   # says what is missing or still points at your machine
pnpm fly:secrets           # sends them to monaztore-api and monaztore-web
```

The script sends nothing while there is a problem (localhost, Mailpit, the development
`BETTER_AUTH_SECRET`) and leaves out what goes in `fly.*.toml` and what is local only
(`TEST_DATABASE_URL`, `MAILPIT_URL`). The secrets apply with the next deploy.

### 4. GitHub Actions

One deploy token per app, saved as a repository secret:

```bash
gh secret set FLY_API_TOKEN_API --body "$(fly tokens create deploy -a monaztore-api -x 8760h)"
gh secret set FLY_API_TOKEN_WEB --body "$(fly tokens create deploy -a monaztore-web -x 8760h)"
```

Without `gh`: GitHub → Settings → Secrets and variables → Actions → New repository secret, with
the full text `fly tokens create deploy …` prints (it starts with `FlyV1 `). They expire in a
year: run these two commands again before then.

### 5. First deploy

```bash
git checkout main && git pull
pnpm release 1.0.0
```

Follow it in Actions → Deploy. The first time, Fly creates the machines and gives them IPs.

### 6. Domains

```bash
fly certs add app.monaztore.com -a monaztore-web
fly certs add api.monaztore.com -a monaztore-api
```

In your DNS: a `CNAME` from `app` → `monaztore-web.fly.dev` and from `api` → `monaztore-api.fly.dev`.
If the DNS is on Cloudflare, leave them as **DNS only** (grey cloud): Fly issues the certificate
and `Fly-Client-IP` stays the client's real IP for the rate limits.
`fly certs check <domain> -a <app>` says when it's ready.

### 7. Check

- `curl https://api.monaztore.com/health` → `{"status":"ok","database":"ok"}`
- `https://app.monaztore.com/login` shows the methods in `AUTH_METHODS` and the email arrives.

## A store on its own domain

Each store answers on the domains connected in its workspace (Store → Domains,
`store_domain`); the web finds the store from the request's Host. For `superchivacr.com`:

1. In the workspace, connect `superchivacr.com` as the main domain (`www.` falls back to it).
2. Certificates on the web app, for both names:

   ```bash
   fly ips list -a monaztore-web            # the IPv4 (shared) and IPv6 to point the apex at
   fly certs add superchivacr.com -a monaztore-web
   fly certs add www.superchivacr.com -a monaztore-web
   ```

3. In the domain's DNS: an `A` and an `AAAA` record for the apex (`@`) with those IPs (an apex
   can't be a `CNAME`) and a `CNAME` from `www` → `monaztore-web.fly.dev`. On Cloudflare, **DNS
   only** (grey cloud). Lower the TTL a day before the switch so going back is quick.
4. `fly certs check superchivacr.com -a monaztore-web` says when it's ready.

Until the DNS moves, the old shop keeps working; the switch is the DNS change itself.

## Files (product photos)

In production the photos go to a **private** Cloudflare R2 bucket: create it (e.g.
`monaztore-files`) and an R2 API token with Object Read & Write on that bucket, and set
`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET` in
`.env.production`. Without them the machines write to their own disk, which a deploy wipes.

## Migrating a WooCommerce shop into production

The importer runs from your machine against the production database and bucket (it never
writes to the old shop):

1. Sign in to `APP_URL` and create the store's workspace (the slug is `--store`).
2. In a shell with the production values (`DATABASE_URL` through `fly proxy` from step 2, the `R2_*` above)
   and the shop's read-only `WOOCOMMERCE_KEY`/`WOOCOMMERCE_SECRET`:

   ```bash
   pnpm import:woocommerce --url https://superchivacr.com --store superchiva --dry-run
   pnpm import:woocommerce --url https://superchivacr.com --store superchiva
   ```

   It can run again right before the DNS switch: a second run updates what the first brought
   (stock, prices, new products) and keeps the 301s for the old addresses.
3. Review the drafts it notes (forms left out of pages, "Contáctanos") and set the payments in
   Store. To try it before moving the DNS, connect a temporary domain too (e.g.
   `superchiva.monaztore.com`: a `CNAME` to `monaztore-web.fly.dev` and its `fly certs add`) and
   place a test order there.

## Every release

```bash
pnpm release          # 1.4.2 → 1.4.3
pnpm release minor    # 1.4.2 → 1.5.0
pnpm release major    # 1.4.2 → 2.0.0
pnpm release 2.1.0    # an exact one, higher than the last
```

It requires being on `main`, with no changes and up to date with GitHub; it asks before
publishing (`--yes` skips that) and, with `gh`, follows the deploy to the end.

`pnpm run deploy [patch|minor|major|x.y.z]` is the same with the checks first (lint, typecheck
and the unit tests): one command, and it stops before tagging if `main` doesn't pass.
(`pnpm deploy`, without `run`, is a pnpm command of its own.) `--notes "…"` says what goes out:
it is kept in the tag and goes on top of the GitHub Release. Without a
terminal: Actions → Deploy → Run workflow, with the version (`patch` by default).

What `.github/workflows/deploy.yml` does with the `vX.Y.Z` tag:
1. Waits for that commit's CI (lint, typecheck and Vitest) and stops if it fails.
2. Deploys `monaztore-api`. Before starting it, `release_command` runs the migrations; if they
   fail, nothing is deployed and the previous version keeps running.
3. Deploys `monaztore-web`.
4. Creates the version's GitHub Release: the `--notes`, the commits since the previous version
   and the pull requests merged in between.

## Operate

```bash
fly logs -a monaztore-api                     # or monaztore-web
fly status -a monaztore-web
fly ssh console -a monaztore-api              # a shell on the machine (cd /app)
fly secrets list -a monaztore-api
fly secrets deploy -a monaztore-api           # applies secrets without waiting for a release
```

- **Roll back**: `fly deploy --config fly.web.toml --image
  registry.fly.io/monaztore-web:v1.4.2` (same for the API). Migrations aren't undone: each
  migration must be compatible with the previous version.
- **More machines**: the web scales with `fly scale count 2 -a monaztore-web`. The API stays at one:
  the scheduled jobs run in its process.
