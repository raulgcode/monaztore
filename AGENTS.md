# Monaztore · guide for agents and people

Monaztore comes from the `mono-template` template: a monorepo with the usual things already solved
(sign-in with Google, password or an email link, multi-tenant workspaces, languages, light and
dark theme, emails, security, tests and deployment). The project's own work is written on top,
following these rules. If a rule doesn't apply, change it here first and then the code.

## Monorepo map

| Path                 | What it is                                                          |
| -------------------- | ------------------------------------------------------------------- |
| `apps/web`           | React Router 8 (framework mode): pages, sign-in, the workspace      |
| `apps/api`           | Fastify + Zod: public API, webhooks and scheduled jobs              |
| `apps/e2e`           | Playwright: BDD scenarios on phone and desktop, accessibility (axe) |
| `packages/core`      | Multi-tenant use cases. All business logic lives here               |
| `packages/contracts` | `zod/mini` schemas shared by forms, actions, API and core           |
| `packages/db`        | Drizzle: schema, migrations, client, test utilities                 |
| `packages/auth`      | Better Auth: email link, password, Google and organizations         |
| `packages/email`     | Nodemailer + MJML: branded emails, in light and dark                |
| `packages/i18n`      | Languages (en, es): typed dictionaries, `t()`, language choice      |
| `packages/env`       | Environment variable validation with Zod                            |
| `tooling/*`          | Repo scripts: setup, release, Fly secrets, remote e2e               |

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

- **Every branch that will be merged into `main` first gets the latest `main`**: `git fetch
  origin main` and `git merge origin/main` (resolve conflicts, regenerate generated files with
  their CLI, such as a migration whose number clashes), run lint, typecheck and tests, push and
  wait for CI to be green.
- CI (`.github/workflows/ci.yml`): every push runs `pnpm lint`, `pnpm typecheck` and `pnpm test`
  (unit, integration with Postgres and Mailpit, browser).
- The e2e tests (`.github/workflows/e2e.yml`) run on demand: `pnpm e2e:remote [branch] [--project
  desktop|mobile] [--grep "text"]` (needs `gh auth login`), or from Actions. Run them before
  merging a change that touches flows. Locally: `pnpm test:e2e`.
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
pnpm test                # Vitest: unit + integration + browser
pnpm test:e2e            # Playwright locally
pnpm e2e:remote [branch] # Playwright on GitHub Actions
pnpm typecheck && pnpm lint
pnpm db:generate && pnpm db:migrate   # after changing the schema
pnpm release [patch|minor|major|x.y.z]  # publishes main to production (tag → Fly.io)
pnpm fly:secrets [--check]  # sends .env.production to Fly's secrets
pnpm --filter @monaztore/web lighthouse
```
