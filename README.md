# Monaztore

## Getting started

```bash
corepack enable && pnpm install
pnpm run setup     # .env, secrets, sign-in methods, Docker, migrations, hooks, Chromium
pnpm dev           # web http://localhost:5173 · api http://localhost:3001
```

- Sign in as any user at http://localhost:5173/dev/sign-in (only in `pnpm dev`).
- Emails (sign-in links, confirmations) land in Mailpit: http://localhost:8025.
- Change how people sign in: `pnpm run setup --auth magic-link,password,google`.

## How we work here

Everything is in [AGENTS.md](AGENTS.md): the monorepo map, the rules (CLI first, React Router
with its skill, forms with Conform + Zod, mobile first, tests, languages, security) and the
commands. For a new feature, the [new-feature](.agents/skills/new-feature/SKILL.md) skill.
Production: [docs/deploy.md](docs/deploy.md).
