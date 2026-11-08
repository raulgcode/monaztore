# Monaztore · guide for agents and people

Monaztore comes from the `mono-template` template: a monorepo with the usual things already solved
(sign-in with Google, password or an email link, multi-tenant workspaces, languages, light and
dark theme, emails, security, tests and deployment). The project's own work is written on top,
following these rules. If a rule doesn't apply, change it here first and then the code.

## Monorepo map

| Path                            | What it is                                                                        |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `apps/web`                      | React Router 8 (framework mode): pages, sign-in, the workspace                    |
| `apps/api`                      | Fastify + Zod: public API, webhooks and scheduled jobs                            |
| `apps/e2e`                      | Playwright: BDD scenarios on phone and desktop, accessibility (axe)               |
| `packages/core`                 | Multi-tenant use cases (stores, catalog, imports). All business logic lives here  |
| `packages/contracts`            | `zod/mini` schemas shared by forms, actions, API and core                         |
| `packages/db`                   | Drizzle: schema, migrations, client, test utilities                               |
| `packages/auth`                 | Better Auth: email link, password, Google and organizations                       |
| `packages/email`                | Nodemailer + MJML: branded emails, in light and dark                              |
| `packages/i18n`                 | Languages (en, es): typed dictionaries, `t()`, language choice                    |
| `packages/env`                  | Environment variable validation with Zod                                          |
| `packages/importer-woocommerce` | Reads a WooCommerce shop (REST v3 or Store API) into Monaztore's shape            |
| `packages/storage`              | Store files (product photos): Cloudflare R2 or a folder on disk; WebP re-encoding |
| `packages/hacienda`             | Costa Rica's electronic invoices: v4.4 XML, signing with the .p12, Hacienda's API |
| `packages/create`               | `create-monaztore`: a new project from this template, `rename`, template updates  |
| `tooling/*`                     | Repo scripts: setup, release, Fly secrets, remote e2e                             |

## A template: one instance per client

Monaztore is also the template of every client's project: each client gets an instance of their
own (their repo, database, Fly apps and domain), multistore or a standalone store.
- Who the project is lives in `packages/env/src/project.ts` (`name`, `slug`, `domain`); the code
  reads it (`@monaztore/env/project`) where the name or a host shows. Anything else that names
  the project is plain text that `rename` rewrites, so never build the name from pieces.
- `pnpm create monaztore <slug> [--name "Super Chiva"] [--domain superchiva.cr] [--single]`
  (`packages/create`, published as `create-monaztore`) clones the template, renames it (scope
  `@<slug>/*`, texts, databases, Fly apps, domain), sets `STORE_MODE`, installs, formats and
  commits; from this repo, `pnpm new <slug>` does the same next to it.
- `pnpm template:update [ref]` in a client's project brings the template's changes: the
  template, renamed to the project, is committed on its `template` branch and merged, so git
  only stops where the client changed the same lines. `pnpm rename <slug>` renames in place.
- `STORE_MODE` (`.env`): `multi`, many stores on their own domains and the landing on
  `APP_URL`; `single`, one store on every host (`resolveOnlyStore`) and onboarding closed once
  it exists (`canOpenWorkspace`). A feature works in both modes.

## Rules

### Tools: always their CLI

**If a tool has a CLI, use its CLI.** Never hand-write what the CLI generates, nor copy an output
from memory: the CLI knows the repo's exact version.
- React Router routes and files: `npx react-router reveal entry.server|entry.client`,
  `react-router typegen` (runs on its own in `pnpm typecheck`). New projects: `create-react-router`.
- Database: `pnpm db:generate` (drizzle-kit) for each migration, `pnpm db:migrate`,
  `pnpm db:studio`. Never write a migration or a `meta/` by hand.
- Better Auth tables: `pnpm auth:generate` (Better Auth's CLI), never by hand.
- UI components: `pnpm dlx shadcn@latest add <component>` from `apps/web`
  (`components.json`), then adjusted to the brand tokens.
- Dependencies: `pnpm add <pkg> --filter <package>` (without `@catalog:`, which corrupts the
  catalog), then move the version to the `catalog` in `pnpm-workspace.yaml`; the `package.json`
  keeps `"catalog:"`. Only pnpm writes `pnpm-lock.yaml`.
- Format and lint: `pnpm format` and `pnpm lint` (Biome), never by hand.
- Playwright: `npx playwright cli …` (`playwright-cli` skill), `npx playwright init-agents`.
- Skills: `npx skills add <repo> --skill <name>`.

### React Router 8: the official skill rules

**Before writing or reviewing any route, read the `.agents/skills/react-router` skill** (also in
`.claude/skills`) and the docs installed in `apps/web/node_modules/react-router/docs`, which are
the ones for the repo's exact version. If the skill is missing, install it before going on:
`npx skills add https://github.com/remix-run/react-router --skill react-router`; if the docs are
missing, run `pnpm install`. Don't add antipatterns the skill rules out.
- **Never use `useEffect` to fetch server data.** Reads with a `loader`, writes with an `action`
  (or `useFetcher`); React Router does the revalidation. `useEffect` is only for browser effects,
  such as moving focus.
- Auth and tenant with `middleware` + `context` (`app/middleware/auth.server.ts`, `app/context.ts`).
- Types from `./+types/<route>`; URLs with typed `href()`, never loose strings.
- `<Form>` when the mutation navigates; `useFetcher` when the person stays on the page.
- Server code in `*.server.ts` modules; a new route is registered in `app/routes.ts`.

### Forms: Conform + Zod, always

Every form uses **Conform** (`@conform-to/react`, `@conform-to/zod/v4`) with a schema from
`@monaztore/contracts`. The same schema validates in the browser (`onValidate` with
`parseWithZod`) and in the `action` (`parseWithZod`); errors come back with
`data({ result: submission.reply() }, { status: 400 })`. Inputs use `TextField` (it wires label,
description and errors with `aria-*`). Schema errors are i18n keys
(`message("forms.emailInvalid")`) that `FieldErrors` translates; the route loads `forms`. No
`useState` per field and no hand-written validation. Examples: `routes/sign-up.tsx`,
`routes/app/onboarding.tsx`.

### Intuitive and mobile first

People use the app from their phone. Every screen is designed for the phone first; desktop is the
enlarged version, never the other way around.
1. **Mobile first.** Every screen works from 360 px wide, and every BDD scenario runs in
   Playwright's `mobile` project, not only in `desktop`.
2. **One task, one screen, one main action.** The main button stays within thumb reach and
   everything tappable is at least 44 × 44 px. In the workspace, the sections are the bottom bar
   on the phone and the sidebar from 768 px (`AppShell`; a new section is one more item).
3. **Nothing depends on hover, a physical keyboard or wide tables.** What scrolls sideways goes in
   `<ScrollShadow>`; on the phone, tables become lists.
4. **Talk the way people talk.** Words they would say out loud, no technical jargon ("tenant",
   "organization") in the interface: in the app it's a "workspace".
5. **Defaults that already work.** A new screen starts filled in with the usual values.
6. **Every screen explains itself.** If it needs a tutorial to be used, it gets redesigned.

### Tests: every feature comes with its tests

A change that adds or changes behavior without tests isn't finished.
- **TDD** for pure logic and `core` services: write the failing test, then the code.
- **BDD** for user flows: a `Feature / Scenario` with `Given / When / Then` steps (`test.step`) in
  `apps/e2e/tests`. No Cucumber.
- Exploratory UI that still changes a lot is tested once it settles, not before.

| Project       | Files                                | For                                                    |
| ------------- | ------------------------------------ | ------------------------------------------------------ |
| `unit`        | `*.test.ts`                          | Pure functions, no I/O                                 |
| `integration` | `*.integration.test.ts`              | Services against real Postgres and Mailpit             |
| `browser`     | `apps/web/app/**/*.browser.test.tsx` | React components in Chromium (Vitest Browser Mode)     |
| Playwright    | `apps/e2e/tests/*.spec.ts`           | Full flows, accessibility with axe, mobile and desktop |

**Don't use Jest or jsdom.** Components are tested in a real browser with
`vitest-browser-react`. Each integration test creates its own workspace with `createTestTenant`
(`@monaztore/db/testing`); never share rows between tests or truncate tables.

In Playwright (`apps/e2e/support/fixtures.ts`):
- `ownerTest` starts with the worker's shared session (an owner with the "My company" workspace)
  and its `workspace`; `test` + `signIn`/`signInWithWorkspace` is for sign-in, onboarding or
  anything that changes the account (language, sign out), because the worker's session is shared.
- What a scenario prepares in the database goes through `core`'s use cases with
  `workspace.tenant` or `workspaceOf(page)`, over the worker's `db` connection; never a connection
  of its own. Another browser (a teammate, another phone) is opened with `newVisitor()`, without a
  session.
- What is set up and cleaned up on its own is a fixture; a screen that 3 or more specs walk
  through, a page object in `support/`; the rest, functions (`navigation.ts` with `openSection`,
  `mailpit.ts` with `getLinkFromEmail`/`uniqueEmail`). The page object acts and the scenario
  checks.
- Each scenario proves one behavior and says so in its title, with its result ("creates an
  account, confirms the email and goes on to create a workspace", not "sign-up works"), and each
  Then checks the exact text, number or state the person sees. Locators by role, label or text,
  in English (the source language). `pnpm lint` rejects in `tests/` (`apps/e2e/lint/*.grit`)
  `waitForTimeout`, `networkidle`, `.only`, `force: true` and XPath.
- Every new page goes into `tests/accessibility.spec.ts` (light and dark).

Playwright agents (`.claude/agents`, with the `playwright-test` MCP server from `.mcp.json`; they
need Postgres and Mailpit up): **Healer** fixes a failing test and never skips or loosens it (if
the app is wrong, it reports it); **Planner** walks the app from `tests/seed.spec.ts` and writes a
plan in `apps/e2e/specs`; **Generator** turns a plan into a spec, which is reviewed like any code.
The `playwright-cli` skill opens the app and takes snapshots and traces.

### Performance: Lighthouse budget

`apps/web/lighthouserc.json` defines the budget (score ≥ 0.95, FCP ≤ 2.2 s, LCP ≤ 2.5 s,
JS ≤ 170 KB transferred per page, no third parties). If a change goes over, **optimize first**
(code splitting, dropping dependencies, `zod/mini`, lazy loading). Only raise a limit with an
explicit justification. `pnpm --filter @monaztore/web lighthouse` audits light, dark and Spanish.

### Accessibility

Pages must have no axe violations (WCAG 2.2 AA). A single `h1` per page (`PageHeader`), forms
with `TextField`, notices with `role="status"` or `role="alert"`.

### Brand and themes

- Colors only through tokens (`bg-primary`, `text-muted-foreground`, …) defined with
  `light-dark()` in `apps/web/app/app.css`. A new text or background token is added to the pairs
  in `app/lib/brand.test.ts`, which checks AA contrast in light and dark. To change the brand,
  change `app.css` and `lib/brand.ts`; emails take the same colors (`packages/email/src/brand.ts`,
  and `brand.test.ts` checks that they match).
- The theme (`system`/`light`/`dark`) lives in a cookie that `root.tsx`'s `loader` reads; the
  server paints `data-theme` on `<html>`, so there is no flicker.
- Everything that scrolls sideways goes inside `<ScrollShadow>`. Never a loose `overflow-x-auto`.
- Emails (`@monaztore/email`): **always MJML**, never hand-written HTML or another library. Each
  template is MJML (`@faire/mjml-react`) inside `<EmailLayout>`, in the recipient's language.

### Languages: every feature ships in every language at once

Two languages (`locales` in `packages/i18n/src/locale.ts`): `en` (the source) and `es` (informal
"tú"). Visible text (pages, buttons, `aria-label`, notices, emails) without its version in each
language isn't finished.
1. Each text lives in `packages/i18n/src/messages/{en,es}/<section>.ts`; nothing hardcoded in the
   component. `es` is declared with `satisfies Translation<typeof en>[…]`: a missing key breaks
   `typecheck`, and `messages.test.ts` checks placeholders and tags.
2. Dictionaries **never reach the client bundle**: they are only imported from `*.server.ts`.
   Each `loader` returns its sections with `i18n: translations(context, "…")`; the root sends
   `common`. In the component, `const t = useT()`; in `meta`, `metaT(matches)`; what the server
   builds, `serverT(context)`. Tags with `richText(t, key, { link: (text) => … })`.
3. Messages in `throw data(…)` and `DomainError` are only seen by developers: they go in English,
   without a key.
4. `localeMiddleware` decides the language: `lang` cookie > `user.locale` > `Accept-Language` >
   English. It is changed in Settings (`<LanguagePicker />`, POST to `/locale`).
5. Tests use the source texts (`en`). Routes, parameters, files and keys in English.
6. Another language: add it to `locales`, create its folder in `messages/` and run
   `pnpm typecheck`.

### Sign-in: the methods are picked per project

`AUTH_METHODS` (`.env`, asked by `pnpm run setup`) turns on `magic-link`, `password` and
`google`, in any combination. `/login` only shows the ones turned on (`lib/sign-in.server.ts`)
and the routes of a method that is off respond 404 (`requireMethod`).
- **Email link**: Better Auth `magicLink`, token stored hashed, 5 minutes.
- **Password**: `/sign-up` requires confirming the email before signing in; `/forgot-password`
  and `/reset-password` change it and close the other sessions.
- **Google**: needs `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (the server won't start with
  `google` without them). An email proven by Google, a link or a confirmation is the same account.
- Actions go through Better Auth's server API (`auth.api.*`) after our own checks (rate limits,
  `safeRedirect`). Endpoints we don't use over HTTP go in `disabledOrganizationPaths`.
- `/dev/sign-in` signs in as any user in `pnpm dev`. Three locks keep it out of production:
  `routes.ts` doesn't register the route in the build, `devSignIn` is only on with
  `import.meta.env.DEV` and `requireDevTools` requires localhost.

### Multi-tenant

In Monaztore every store is a workspace (a Better Auth organization). The admin keeps the
workspace in the URL; the public storefront finds its store from the request's Host with
`resolveStoreByHost` (`store_domain`), the one public entry point that picks a store. Operator
tools run from a terminal (`pnpm import:woocommerce`) use `ownerContextForStore`.

The storefront (`routes/store/*`, `core/src/storefront.ts`): `storeMiddleware` puts the store of
the Host in `storeContext` (null on the platform's host, where `/` is the landing and store-only
pages answer 404). Its use cases take a `StorefrontContext` and only read what a shopper may see
(`status = "active"`; descriptions cleaned with `cleanHtml`). Every page has its canonical on the
store's primary domain (`storeOrigin`), Open Graph and, for a product, JSON-LD; `sitemap.xml` and
`robots.txt` are per store, and the `*` route sends a migrated shop's old addresses (`redirect`)
with a 301. e2e opens a store on its own `*.localhost` domain (`support/storefront.ts`; requests
without a browser go through `requestStore`, since Node doesn't resolve `*.localhost`).

Buying (`core/src/orders.ts`): the cart is a signed, host-only cookie with ids and quantities,
never prices (`lib/cart.server.ts`); `priceCart` reads prices and stock from the database every
time. `placeOrder` prices again under lock, numbers the order from `store_settings` (#1001…),
lowers the stock it counts and keeps only the SHA-256 of the order link's token
(`/orders/:token`, a secret path). Manual payments (SINPE Móvil, transfer) live in
`store_settings.payments`; the shopper sends the reference and the store confirms it.

Photos (`core/src/catalog-images.ts`, `@monaztore/storage`): `pnpm import:woocommerce` copies
every photo to the store's own files before importing (`copyCatalogImages`: downloaded once,
re-encoded as WebP with `webImage`, named by content under `organizations/<id>/images/`), so a
migrated store never hotlinks the old shop; Jetpack CDN addresses (`i0.wp.com/…`) are read from
the shop's own host (`imageSrc`). `files` (`services.server.ts`) is R2 with `R2_*` and
`FILES_DIR` on disk without them; `/media/*` serves only `organizations/…` keys, cached forever.
Share cards and JSON-LD resolve them to the store's origin (`absoluteUrl`).

The store in the workspace (`core/src/store-admin.ts`): Orders (`/app/:workspace/orders`, filter
by state in `?status=`) confirms a payment (`markOrderPaid`, which adds to the customer's orders
and spend) or cancels an unpaid order (`cancelOrder`, which puts counted stock back); Store
(`/app/:workspace/store`) connects domains (one main domain: a new main one takes over) and sets
the manual payments, owners only.

Pages (`core/src/pages.ts`, `contracts/src/pages.ts`): the store's own pages ("About us",
"Questions"), built from blocks (heading, text, photo, button, questions, products) in the
workspace's Pages (`/app/:workspace/pages/:pageId`, owners only), with the editor and its preview
side by side from 1024 px and as tabs on the phone. Blocks are JSON checked by `pageBlocksSchema`
and the text's HTML goes through `cleanHtml`; photos are uploaded with `saveStoreImage`. A
published page answers at `/<slug>` on the store's hosts (`routes/store/fallback.tsx`, before the
redirects), is listed in the footer and the sitemap, and a questions block adds FAQPage JSON-LD.
Slugs that are the storefront's own routes are refused (`reservedPageSlugs`); changing a
published page's address leaves a 301 from the old one. `pnpm import:woocommerce` brings the
shop's WordPress pages (`wp/v2/pages`, `wordPressPageBlocks`: Flatsome accordions become
questions; forms are left out and noted) with a 301 from their old address.

Electronic invoicing (`core/src/einvoicing.ts`, `core/src/einvoice-delivery.ts`,
`@monaztore/hacienda`, `contracts/src/einvoicing.ts`): only for stores in Costa Rica
(`store_settings.country = "CR"`, `EINVOICING_COUNTRY`); anywhere else its page answers 404, the
checkout doesn't ask and nothing is queued. The owner sets it up in `/app/:workspace/invoicing`
(linked from Store and from each order, not a bar item: the phone bar is full) in three steps:
their details as in Hacienda (the cédula lookup fills name and activity, `findTaxpayer`), the
CABYS code of what they sell (searched with `searchCabys`; one code for the whole store, 13 % VAT
only for now) and the ATV API user plus the .p12 and its PIN, checked against Hacienda before
saving (`checkHaciendaCredentials`, its own rate limit). The password, the .p12 and the PIN are
sealed with AES-256-GCM (`sealSecret`, key `deriveSecret(BETTER_AUTH_SECRET, "einvoicing")`) and
never shown again; the user's domain decides the environment (`@stag.` is the sandbox). Turned
on, marking an order paid queues its document inside the same transaction (`queueOrderEinvoice`,
or by hand from the order when "issue as soon as paid" is off): an invoice (01) when the shopper
gave a cédula at checkout ("Invoice in my name", `order.taxId`) or the owner typed one, a receipt
(04) otherwise, numbered per kind under the settings row's lock with the store's branch and
terminal (another terminal keeps numbers apart from another system). The API's job
(`apps/api/src/jobs/einvoices.ts`, every 15 s) leases due documents (`for update skip locked`),
builds and signs the XML from the order's lines (prices include VAT; CRC only), sends it, polls
the answer with backoff and emails the buyer the XML and Hacienda's answer (`EinvoiceEmail`).
A rejected document can be replaced by a new one; a failed one (credentials, key, unreachable) is
retried from the order once fixed. `HACIENDA_PROVIDER_ID` is the provider ID on every document
(the store's own without it). The shopper's order page shows the accepted document and
`/orders/:token/:file` downloads its XML: another public entry, by the order's secret link, the
same key as its page. e2e can't reach Hacienda, so scenarios save the credentials through core
with a login check that says yes and `testCertificate` (`@monaztore/hacienda/testing`).

The platform's panel (`/admin`, `core/src/platform-admin.ts`): the only place that reads across
stores. It takes a `PlatformAdminContext`, which only `platformAdminContext` gives, for
`user.role = "admin"` read from the database (Better Auth's `admin` plugin; its endpoints are off
over HTTP, `disabledAdminPaths`). Super admins come from `SUPER_ADMIN_EMAILS` with
`pnpm admin:seed` (every deploy runs it). Anyone else, or a support session inside a store, gets a
404. The email link or password isn't enough: `requireSuperAdmin` also asks for the second step
every 12 hours (`ADMIN_MFA_TTL_MS`) at `/admin/mfa`: an authenticator app (`core/src/mfa.ts`,
TOTP with the secret sealed under `deriveSecret(…, "mfa")`, 8 hashed one-time recovery codes, a
code never works twice) or a passkey (`core/src/passkeys.ts`, `@simplewebauthn`, only on
APP_URL's host, a 5-minute challenge used once, a counter that can't go back), added in
`/admin/security`. Both tables are per person (`user_totp`, `passkey`), so the stores' teams use
the same second step. A lost phone: `pnpm admin:reset-2fa <email>`. `/admin` lists and searches
every store (`listStores`), shows one with its team and whether each has the second step
(`getStore`), and sets the commission on **card** sales in basis points: the platform's
(`platform_settings`) and a store's own (`store_agreement`), read with `cardCommissionBpsFor`;
SINPE Móvil and transfers never pay one. Every change and security event goes to
`platform_audit_log` (`recordAudit`), which stores never see; `notifySupportAccess` (off at
first) decides whether a store is told when support enters its account.

Support and the teams' second step (`core/src/support.ts`, `middleware/auth.server.ts`): from a
store's detail, "Enter as the owner" or "Only look" opens its panel as its first owner for an
hour (Better Auth's `impersonateUser`; never another super admin). `support_visit` ties the
session to the visit: `requireSession` refuses every change in "only look" (403), logs each
other change (`support_change`, method and path), and `requireTenant` keeps support inside that
store. A banner stays on top with "Back to admin" (`/admin/support/stop`, which logs the end and
puts the admin's own session back). The store sees the visits on its home only with
`notifySupportAccess` on (`recentSupportVisits`). Every store's team passes the second step once
per session (`requireSecondStep`, `TEAM_MFA_TTL_MS`) at `/app/mfa`, with the same authenticator
app or passkey as /admin (`SecondStep`, `PasskeysManager`), and adds fingerprints in Settings →
Security (`/app/:workspace/settings/security`); support never sets them up on the owner's
account. In e2e, `passSecondStep` (fixtures) sets the app up the first time and types the next
code after.

Every `core` use case takes a `TenantContext` and filters by `organizationId`.
- The workspace goes in the URL (`/app/:workspace/…`) and `requireTenant` resolves it with
  `resolveTenant`, which checks the membership; never take the workspace from the session or from
  a form field. Someone else's workspace responds 404, the same as one that doesn't exist.
- The session only remembers the last workspace used, so `/app` and the next sign-in open it.
- The only entry points without a tenant are the public ones, and each one is justified here.
- A new workspace section: `routes/app/<section>.tsx` under `:workspace` in `routes.ts`, its item
  in `AppShell`, its i18n namespace, its `core` use case with an integration test (including that
  another workspace can't see its data), its BDD scenario and its line in
  `accessibility.spec.ts`.

### Security

- Rate limits with `hitRateLimit` (`core/src/rate-limits.ts`): an upsert in Postgres
  (`rate_limit`), so they hold across every machine. In the web, `withinRateLimits` and the rules
  in `app/lib/rate-limit.server.ts`; Better Auth's limiter stores there too. **Every action that
  sends an email to an address someone typed gets its limit.** The IP comes from
  `CLIENT_IP_HEADER`; never from `X-Forwarded-For` without a proxy that cleans it.
  `AUTH_RATE_LIMIT=off` (e2e only) turns them off.
- `securityMiddleware` (first in `root.tsx`) sets a CSP with a nonce (`entry.server.tsx` passes it
  to `ServerRouter`), `X-Frame-Options`, HSTS over HTTPS and rejects chunked bodies (411) or
  bodies over 6 MB (413). No inline or third-party scripts: if something new needs another
  origin, it is added to the policy with its reason.
- Redirects with `safeRedirect` (`app/lib/safe-redirect.ts`), never by hand.
- Secrets: each use has its own key derived from `BETTER_AUTH_SECRET` with `deriveSecret`
  (`secrets` in `services.server.ts`); outside localhost the `.env.example` value is rejected.
- `allowedActionOrigins` (`app/lib/action-origins.ts`) carries the production host, for React
  Router's CSRF check behind Fly's proxy.
- `pnpm audit --prod --audit-level high` runs in CI; an accepted advisory goes into
  `auditConfig` in `pnpm-workspace.yaml` with its reason.

### Database

Change the schema in `packages/db/src/schema`, then `pnpm db:generate` and `pnpm db:migrate`.
Never `drizzle-kit push` against production. Each migration must be compatible with the previous
version of the app (deploys don't undo migrations).

### Environment variables

Every new variable goes in `.env.example` with a comment saying what it is, and in the
`packages/env` schema. If it is a local secret, add its generator in `tooling/setup/index.ts` so
`pnpm run setup` creates it; if it only exists locally, in `localOnly` of
`tooling/fly-secrets/secrets.ts`. A new public URL goes in `[env]` of both `fly.*.toml`.

## Workflow

- **No GitHub Actions minutes: every check runs locally (or on the agent's cloud machine), never
  on push or on a PR.** The project has no budget for them. `ci.yml` and `e2e.yml` only run when
  someone starts them by hand, and nobody does unless the owner asks.
- **Every branch that will be merged into `main` first gets the latest `main`**: `git fetch
  origin main` and `git merge origin/main` (resolve conflicts, regenerate generated files with
  their CLI, such as a migration whose number clashes), then run `pnpm lint`, `pnpm typecheck`,
  `pnpm test` (unit, integration with Postgres and Mailpit, browser) and the Playwright scenarios
  the change touches (`pnpm test:e2e`), all locally, and only then push and merge.
- Agents may merge their own PRs into `main` without the owner's review, once the local checks
  pass.
- Production on Fly.io (`docs/deploy.md`): `pnpm release [patch|minor|major|x.y.z]` creates the
  tag and `.github/workflows/deploy.yml` deploys the API (with migrations) and then the web.
  Secrets with `pnpm fly:secrets` from `.env.production` (never in git).
- The pre-commit hook (Lefthook) only formats with Biome.
- A new feature follows the `new-feature` skill (`.agents/skills/new-feature`).

## Commands

```bash
corepack enable && pnpm install
pnpm run setup           # .env, secrets, sign-in methods, hooks, Chromium, Docker, migrations
pnpm dev                 # web :5173, api :3001 · /dev/sign-in to sign in as anyone
pnpm sandbox [--reset]   # a store to try things on, at sandbox.localhost (local database only)
pnpm test                # Vitest: unit + integration + browser
pnpm test:e2e            # Playwright locally
pnpm e2e:remote [branch] # Playwright on GitHub Actions
pnpm typecheck && pnpm lint
pnpm db:generate && pnpm db:migrate   # after changing the schema
pnpm admin:seed          # SUPER_ADMIN_EMAILS become super admins (/admin)
pnpm admin:reset-2fa <email>  # someone lost their authenticator app and recovery codes
pnpm release [patch|minor|major|x.y.z]  # publishes main to production (tag → Fly.io)
pnpm fly:secrets [--check]  # sends .env.production to Fly's secrets
pnpm --filter @monaztore/web lighthouse
```
