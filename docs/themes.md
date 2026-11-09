# Storefront themes

A theme is **data, not a folder of templates**. The storefront's pages (`apps/web/app/routes/store/*`,
`apps/web/app/components/storefront/*`) are shared by every theme; a theme says which colors they
paint with and which layout pieces they use. That's why every theme fits the Lighthouse budget and
passes axe: there is no font, script or page of its own to download.

The owner picks the theme, its palette, a brand color, logo, cover photo and texts in the
workspace's **Design** (`/app/:workspace/design`, `routes/app/design.tsx`), with a live preview
(`components/storefront/theme-preview.tsx`).

## Where each piece lives

| What                                   | File                                                          |
| -------------------------------------- | ------------------------------------------------------------- |
| The list of ids a form can pick        | `packages/contracts/src/store-theme-ids.ts` (`storeThemeIds`) |
| The preset: palettes and layout        | `packages/core/src/theme-presets.ts` (`storeThemes`)          |
| Palette ids                            | `PaletteId` in the same file (unique across themes)           |
| Its name and "for whom" in Design      | `packages/i18n/src/messages/{en,es}/design.ts`                |
| Default hero subtitle and 3 highlights | `packages/i18n/src/messages/{en,es}/storefront.ts`            |
| What the owner saved                   | `store_settings.theme` (`StoreThemeSettings`, `packages/db`)  |
| Turning settings into CSS variables    | `resolveStoreTheme` (same file as the presets)                |

## Adding a theme, step by step

Say the new theme is `market` (a grocery store).

1. **The id.** Add it to `storeThemeIds` in `packages/contracts/src/store-theme-ids.ts`. From here
   `pnpm typecheck` points at every place still missing it.
2. **The preset.** In `packages/core/src/theme-presets.ts`, add `market` to `storeThemes`:
   - `palettes`: at least 3, built with `palette(id, surfaces, { light, dark })`. The surfaces are
     `neutral`, `warm` or `cool` (or a new set, like those). The brand color is adjusted to read at
     AA on them, but pick colors that already do. The first one is what a store starts with.
     Each palette id is new: add it to `PaletteId`.
   - `layout` (`ThemeLayout`): `hero` (`banner`, `spotlight`, `compact`), `productCard`
     (`square`, `portrait`, `row`), `filters`, the front page's `sections` in order
     (`highlights`, `collections`, `new`, `sale`), `homeProducts`, `headingFont` (`sans` or
     `serif`, the system's) and `radius` (rem).
3. **The texts, in every language** (`en` and `es`):
   - `design.ts`: `theme_market`, `theme_marketFor` and `palette_<id>` for each new palette.
   - `storefront.ts`: `heroSubtitle_market` and `highlight_market_1` … `_3`.
     A missing key breaks `pnpm typecheck`.
4. **The checks.** `pnpm test` already covers a new theme: `themes.test.ts` checks every palette
   at WCAG AA in light and dark (and with any brand color on top), and
   `tests/accessibility.spec.ts` opens the store in every theme. Run
   `pnpm --filter @monaztore/e2e test tests/accessibility.spec.ts tests/store-design.spec.ts`.
5. **See it.** `pnpm dev`, then `pnpm sandbox` and open the workspace's Design: the new theme is
   one more card, with its preview. Save it and open the store at `sandbox.localhost:5173`.

No migration is needed: `store_settings.theme` is text, and a store with an id that no longer
exists falls back to the default theme (`resolveStoreTheme`).

## When a layout piece isn't enough

If the new theme needs something none of the current pieces do (another hero, another card), add
it as a new value of `ThemeLayout` (for example `hero: "split"`) and draw it in the shared
components: `store-home.tsx` (hero and sections), `product-grid.tsx` (cards) and
`theme-preview.tsx` (the preview in Design). Then every theme can use it. Keep it mobile first,
without web fonts or third-party scripts, and add a browser or e2e test for it.

## In a client's project (made with `pnpm create monaztore`)

The steps are the same, in the client's own repo (the scope is `@<slug>/*` instead of
`@monaztore/*`).

- **A theme any store could use** (a new kind of shop) belongs in the template: add it here, in
  Monaztore, and bring it to the client with `pnpm template:update`. Every client gets it.
- **A theme only for that client** goes in their repo. Add it **at the end** of `storeThemeIds`,
  `storeThemes` and the dictionaries, so `pnpm template:update` only conflicts where both changed
  the same lines (and those conflicts are a list to keep both sides of).
- A client who only wants their own colors doesn't need a theme: Design's brand color, logo,
  cover photo and texts already do that.
