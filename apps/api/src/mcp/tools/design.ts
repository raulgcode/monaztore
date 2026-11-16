import {
  FOOTER_MENU_MAX,
  HIGHLIGHTS_MAX,
  STORE_MENU_MAX,
  STORE_SUBMENU_MAX,
  storeThemeIds,
  storeThemeSchema,
} from "@monaztore/contracts";
import { storeIllustrationIds } from "@monaztore/contracts/illustrations";
import { getThemeSettings, storeThemes, updateStoreTheme } from "@monaztore/core";
import { z } from "zod";
import { change, json, readOnly, storeArg, type ToolModule } from "../kit";

const designFields = {
  theme: z.enum(storeThemeIds).optional(),
  palette: z
    .string()
    .max(40)
    .optional()
    .describe("One of the theme's palettes, from get_store_design"),
  brandColor: z
    .union([z.string().regex(/^#?[0-9a-fA-F]{6}$/), z.literal("")])
    .optional()
    .describe("#rrggbb; it is adjusted to read in light and dark. Empty: the palette's own"),
  heroTitle: z.string().max(80).optional(),
  heroSubtitle: z.string().max(160).optional(),
  announcement: z
    .string()
    .max(120)
    .optional()
    .describe('A line above the header: "Free shipping over 30 000"'),
  categoriesLabel: z
    .string()
    .max(40)
    .optional()
    .describe('What the store calls its categories ("Designs", "Brands"); empty: "Categories"'),
  highlights: z
    .array(z.string().max(60))
    .max(HIGHLIGHTS_MAX)
    .optional()
    .describe('Up to three short promises ("Delivery in 24 h"); none: the theme\'s own'),
  showHero: z
    .boolean()
    .optional()
    .describe("false: the theme's front page starts with the products, without its cover"),
  heroEyebrow: z.string().max(40).optional().describe('A short line above the title: "New"'),
  heroButtonLabel: z.string().max(40).optional().describe('Empty: "See the catalog"'),
  heroButtonHref: z
    .string()
    .max(500)
    .optional()
    .describe(
      "Where the cover's button goes: /a-page, /collections/x, /products/y or https://…; empty: the catalog",
    ),
  heroIllustration: z
    .union([z.enum(storeIllustrationIds), z.literal("")])
    .optional()
    .describe("A built-in drawing for a cover without a photo; empty: none"),
  showHighlights: z.boolean().optional().describe("false: no strip of promises"),
  menu: z
    .array(
      z.object({
        label: z.string().min(1).max(40),
        href: z.string().max(500),
        children: z
          .array(z.object({ label: z.string().min(1).max(40), href: z.string().max(500) }))
          .max(STORE_SUBMENU_MAX)
          .optional()
          .describe("Links under this one (a submenu)"),
      }),
    )
    .max(STORE_MENU_MAX)
    .optional()
    .describe(
      "The top menu, replacing it whole: links to pages (/slug), categories (/collections/slug), products, /products or https://…; []: all products and categories",
    ),
  footerMenu: z
    .array(z.object({ label: z.string().min(1).max(40), href: z.string().max(500) }))
    .max(FOOTER_MENU_MAX)
    .optional()
    .describe("The footer's links, replacing them whole; []: the store's published pages"),
  showCategoriesMenu: z
    .boolean()
    .optional()
    .describe('false: no "Categories" panel in the top menu, only the store\'s links'),
  categoryChips: z
    .boolean()
    .optional()
    .describe("true: a row of category buttons under the search box"),
  removeLogo: z.boolean().optional(),
  removeHero: z.boolean().optional().describe("Takes the cover photo away"),
};
type DesignFields = { [K in keyof typeof designFields]?: z.infer<(typeof designFields)[K]> };

/** How the storefront looks (Design in the workspace). The logo and cover photo are uploaded there. */
export const registerDesignTools: ToolModule = (server, kit) => {
  server.registerTool(
    "get_store_design",
    {
      title: "See the store's design",
      description:
        "The store's theme, palette, brand color, cover, announcement, highlights, top and footer menus, and the themes and palettes it can pick. A front page built in Pages (set_front_page) takes the place of the theme's cover and sections.",
      inputSchema: { store: storeArg },
      annotations: readOnly,
    },
    kit.tool(async ({ store }: { store: string }) => {
      const tenant = await kit.tenantFor(store);
      return json({
        design: await getThemeSettings(tenant),
        themes: Object.values(storeThemes).map((theme) => ({
          id: theme.id,
          palettes: theme.palettes.map((palette) => palette.id),
        })),
        workspace: kit.workspace(store, "/design"),
      });
    }),
  );

  server.registerTool(
    "update_store_design",
    {
      title: "Change the store's design",
      description:
        "Changes only the fields given; the rest stays. Owners only. Describe the change and ask before saving: shoppers see it at once.",
      inputSchema: { store: storeArg, ...designFields },
      annotations: change,
    },
    kit.tool(async ({ store, ...changes }: { store: string } & DesignFields) => {
      const tenant = await kit.tenantFor(store, { owner: true });
      const current = await getThemeSettings(tenant);
      const highlights = changes.highlights ?? current.highlights ?? [];
      const input = storeThemeSchema.parse({
        theme: changes.theme ?? current.theme ?? storeThemeIds[0],
        palette: changes.palette ?? (changes.theme ? "" : (current.palette ?? "")),
        brandColor: changes.brandColor ?? current.brandColor ?? "",
        heroTitle: changes.heroTitle ?? current.heroTitle ?? "",
        heroSubtitle: changes.heroSubtitle ?? current.heroSubtitle ?? "",
        announcement: changes.announcement ?? current.announcement ?? "",
        categoriesLabel: changes.categoriesLabel ?? current.categoriesLabel ?? "",
        highlight1: highlights[0] ?? "",
        highlight2: highlights[1] ?? "",
        highlight3: highlights[2] ?? "",
        hideHero: (changes.showHero ?? !current.hideHero) ? undefined : "on",
        hideHighlights: (changes.showHighlights ?? !current.hideHighlights) ? undefined : "on",
        heroEyebrow: changes.heroEyebrow ?? current.heroEyebrow ?? "",
        heroButtonLabel: changes.heroButtonLabel ?? current.heroButtonLabel ?? "",
        heroButtonHref: changes.heroButtonHref ?? current.heroButtonHref ?? "",
        heroIllustration: changes.heroIllustration ?? current.heroIllustration ?? "",
        categoryChips: (changes.categoryChips ?? current.categoryChips) ? "on" : undefined,
        hideCategoriesMenu:
          (changes.showCategoriesMenu ?? !current.hideCategoriesMenu) ? undefined : "on",
        menu: JSON.stringify(changes.menu ?? current.menu ?? []),
        footerMenu: JSON.stringify(changes.footerMenu ?? current.footerMenu ?? []),
        removeLogo: changes.removeLogo ? "on" : undefined,
        removeHero: changes.removeHero ? "on" : undefined,
      });
      return json({ saved: true, design: await updateStoreTheme(tenant, input) });
    }),
  );
};
