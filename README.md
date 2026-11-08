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

## Migrar una tienda de WooCommerce

```bash
# Con llaves (WooCommerce → Ajustes → Avanzado → REST API, permiso "Lectura"): trae todo,
# incluidos borradores, stock, SEO de Yoast/Rank Math, variaciones y clientes.
WOOCOMMERCE_KEY=ck_... WOOCOMMERCE_SECRET=cs_... \
  pnpm import:woocommerce --url https://supechivacr.com --store <slug-de-la-tienda>

pnpm import:woocommerce --url https://supechivacr.com --dry-run --out catalogo.json  # solo leer
pnpm import:woocommerce --from catalogo.json --store <slug-de-la-tienda>             # importar un archivo
```

Sin llaves usa la Store API pública (lo que ve cualquier visitante). Se puede correr varias veces:
la segunda actualiza lo que trajo la primera. Cada URL vieja de producto y categoría queda con
una redirección 301 a la nueva, para no perder el posicionamiento en Google. Los clientes entran
sin permiso de marketing: WooCommerce no guarda ese consentimiento.
