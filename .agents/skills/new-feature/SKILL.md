---
name: new-feature
description: Steps to add a new feature or section to this monorepo (core, contract, React Router route, form with Conform + Zod, i18n, unit/integration/browser tests and a Playwright BDD scenario). Use it when starting any new feature, screen, form or use case.
---

# New feature

The rules live in `AGENTS.md`; this is the checklist so none gets skipped. Go in order and tick
each step. Full example in the repo: the workspace (`createWorkspaceSchema`,
`core/src/workspaces.ts`, `routes/app/onboarding.tsx`, `apps/e2e/tests/workspace.spec.ts`).

## 0. Before writing

- Read the `react-router` skill (`.agents/skills/react-router`) and the docs in
  `apps/web/node_modules/react-router/docs` for what you are going to use.
- Decide what the person sees on the phone (360 px): one task, one main action at the bottom.
- Anything with a CLI is done with its CLI (migrations, auth tables, shadcn components).

## 1. Data (if needed)

1. Table in `packages/db/src/schema/<topic>.ts`, with `organizationId` if it belongs to a
   workspace, and exported from `schema/index.ts`.
2. `pnpm db:generate` (to name it: `pnpm --filter @monaztore/db generate --name <what>`) and
   `pnpm db:migrate`. Never write the migration by hand.

## 2. Contract

`zod/mini` schema in `packages/contracts/src/<topic>.ts` (exported from `index.ts`), with errors
as keys: `message("forms.<key>")`. Unit test `<topic>.test.ts` with what is valid and what is
rejected.

## 3. Use case (TDD)

1. First `packages/core/src/<topic>.integration.test.ts`: each test creates its workspace with
   `createTestTenant`. Include that **another workspace can't see or touch** this data.
2. Then `packages/core/src/<topic>.ts`: each function takes a `TenantContext` and filters by
   `ctx.organizationId`. Developer-facing errors with `DomainError`/`NotFoundError`. Export from
   `core/src/index.ts`.
3. Pure logic separately, with its `*.test.ts`.

## 4. Texts

`packages/i18n/src/messages/en/<section>.ts` (the source) and `es/<section>.ts`
(`satisfies Translation<typeof en>["<section>"]`, informal "tú"); register them in each
language's `messages/<locale>/index.ts`. Form errors go in `forms`. Nothing hardcoded in the
component.

## 5. Route

1. Register it in `apps/web/app/routes.ts` (under `:workspace` if it belongs to the workspace) and
   run `pnpm --filter @monaztore/web typecheck` to get `./+types/<route>`.
2. `loader`: read with the use case using `context.get(tenantContext)`; return
   `i18n: translations(context, "<section>", "forms")`.
3. `action`: `parseWithZod(await request.formData(), { schema })`; on failure,
   `data({ result: submission.reply() }, { status: 400 })`; on success, the use case and
   `redirect(href(...))` or `data(...)`. An email to a typed address gets its rate limit
   (`withinRateLimits`).
4. Component: Conform's `useForm` with `onValidate` and the same schema, `TextField` for each
   field, `<Form>` if it navigates or `useFetcher` if it stays. `useT()` for texts, `href()` for
   URLs, `PageHeader` with the only `h1`. No `useEffect` for data.
5. If it is a workspace section, its item in `components/app-shell.tsx`.
6. Colors only through tokens; a new token goes into `lib/brand.test.ts`.

## 6. UI tests

- Component with its own logic: `*.browser.test.tsx` with `vitest-browser-react`.
- Flow: `apps/e2e/tests/<feature>.spec.ts` with `test.describe("Feature: …")`, scenarios
  `ownerTest("Scenario: <behavior and result>")` and steps `test.step("Given/When/Then …")`.
  Then checks the exact text. Prepare data with `workspace.tenant` and `core`, never SQL.
- The new page in `apps/e2e/tests/accessibility.spec.ts`.

## 7. Wrap up

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
pnpm test:e2e            # or pnpm e2e:remote <branch>, on desktop and mobile
```

Check the page in English and Spanish (Settings → Language) and in light and dark. If the feature
adds a rule others must follow (an entry point without a tenant, a variable, a limit), write it in
`AGENTS.md`.
