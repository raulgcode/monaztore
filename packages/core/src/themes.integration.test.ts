import { randomUUID } from "node:crypto";
import { storeThemeSchema } from "@monaztore/contracts";
import { createTestDatabase, createTestTenant } from "@monaztore/db/testing";
import { afterAll, describe, expect, it } from "vitest";
import { DomainError } from "./errors";
import { addStoreDomain, resolveStoreByHost } from "./stores";
import { getStoreTheme, getThemeSettings, updateStoreTheme } from "./themes";
import { resolveTenant } from "./workspaces";

const connection = createTestDatabase();
afterAll(() => connection.close());
const db = connection.db;

async function store() {
  const tenant = await createTestTenant(db);
  const owner = await resolveTenant(db, tenant.userId, tenant.slug);
  if (!owner) throw new Error("no tenant");
  const hostname = `tema-${randomUUID().slice(0, 8)}.test`;
  await addStoreDomain(owner, hostname, { primary: true });
  const found = await resolveStoreByHost(db, hostname);
  if (!found) throw new Error("no store");
  return { owner, storefront: { db, store: found } };
}

const input = (values: Record<string, string | string[]>) => storeThemeSchema.parse(values);

describe("store themes", () => {
  it("turns off the catalog filters the form offered and left unticked, and keeps the rest", async () => {
    const { owner, storefront } = await store();

    await updateStoreTheme(
      owner,
      input({
        theme: "boutique",
        offeredFilters: ["option:Talla", "option:Diseño", "price"],
        shownFilters: "option:Talla",
      }),
    );
    expect((await getStoreTheme(storefront)).hiddenFilters).toEqual(["option:Diseño", "price"]);

    // A later form that no longer offers "Diseño" (no product has it now) leaves it off.
    await updateStoreTheme(
      owner,
      input({
        theme: "boutique",
        offeredFilters: ["option:Talla", "price"],
        shownFilters: ["price"],
      }),
    );
    expect((await getStoreTheme(storefront)).hiddenFilters).toEqual([
      "option:Diseño",
      "option:Talla",
    ]);
  });

  it("a new store shows the default theme", async () => {
    const { storefront } = await store();

    expect((await getStoreTheme(storefront)).id).toBe("essential");
  });

  it("saves the theme with the brand, keeps the photos until they're removed", async () => {
    const { owner, storefront } = await store();

    await updateStoreTheme(
      owner,
      input({ theme: "boutique", brandColor: "#BE185D", heroTitle: "Medias con onda" }),
      {
        logoUrl: "/media/organizations/x/images/logo.webp",
        hero: { url: "/media/hero.webp", smallUrl: "/media/hero-720.webp" },
      },
    );
    await updateStoreTheme(
      owner,
      input({ theme: "boutique", palette: "sand", heroTitle: "Nuevas", removeHero: "on" }),
    );

    const theme = await getStoreTheme(storefront);
    expect(theme).toMatchObject({
      id: "boutique",
      palette: "sand",
      heroTitle: "Nuevas",
      logoUrl: "/media/organizations/x/images/logo.webp",
      heroImageUrl: null,
      heroImageSmallUrl: null,
    });
    // The brand color is not kept when the form sends it empty: the palette's own comes back.
    expect(theme.style["--primary"]).toBe("light-dark(#9a3412, #fdba74)");
  });

  it("only owners change the design, and another store never sees it", async () => {
    const { owner } = await store();
    const other = await store();
    await updateStoreTheme(owner, input({ theme: "wholesale" }));

    await expect(
      updateStoreTheme({ ...owner, role: "member" }, input({ theme: "boutique" })),
    ).rejects.toBeInstanceOf(DomainError);
    expect((await getThemeSettings(owner)).theme).toBe("wholesale");
    expect((await getStoreTheme(other.storefront)).id).toBe("essential");
  });
});
