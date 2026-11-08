# Production on Fly.io

Monaztore runs on Fly.io as two apps built from the same image (`Dockerfile`), plus the database:

| What                 | Where                                              | Config         |
| -------------------- | -------------------------------------------------- | -------------- |
| `monaztore-web`      | `app.monaztore.com`: pages, sign-in, the workspace | `fly.web.toml` |
| `monaztore-api`      | `api.monaztore.com`: public API and scheduled jobs | `fly.api.toml` |
| Fly Managed Postgres | `monaztore-db`, same region as the apps (`iad`)    | —              |

The public URLs (`APP_URL`, `API_URL`) and `CLIENT_IP_HEADER` are in `[env]` of each
`fly.*.toml`; everything else is a secret, the same in both apps.

## Once

### 1. Fly

```bash
brew install flyctl
fly auth login
fly apps create monaztore-api
fly apps create monaztore-web
```

If a name is taken, pick another and change it in `app = "…"` of the `fly.*.toml` and in
`APPS` of `tooling/fly-secrets/index.ts`.

### 2. Database

```bash
fly mpg create --name monaztore-db --region iad --plan basic
```

In the Fly dashboard → Managed Postgres → `monaztore-db` → Connection, copy the **direct** URL
(`…@direct.<id>.flympg.net/…`). If `iad` isn't available, use another nearby region
(`fly platform regions`) and set the same one in `primary_region` of both `fly.*.toml`.

### 3. Secrets

Build `.env.production` from your `.env` (`.gitignore` keeps it out of git) and change what is
for development:

| Variable               | In production                                                              |
| ---------------------- | -------------------------------------------------------------------------- |
| `DATABASE_URL`         | The direct URL from step 2                                                 |
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

## Every release

```bash
pnpm release          # 1.4.2 → 1.4.3
pnpm release minor    # 1.4.2 → 1.5.0
pnpm release major    # 1.4.2 → 2.0.0
pnpm release 2.1.0    # an exact one, higher than the last
```

It requires being on `main`, with no changes and up to date with GitHub; it asks before
publishing (`--yes` skips that) and, with `gh`, follows the deploy to the end. Without a
terminal: Actions → Deploy → Run workflow, with the version (`patch` by default).

What `.github/workflows/deploy.yml` does with the `vX.Y.Z` tag:
1. Waits for that commit's CI (lint, typecheck and Vitest) and stops if it fails.
2. Deploys `monaztore-api`. Before starting it, `release_command` runs the migrations; if they
   fail, nothing is deployed and the previous version keeps running.
3. Deploys `monaztore-web`.

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
