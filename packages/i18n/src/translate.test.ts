import { describe, expect, expectTypeOf, it } from "vitest";
import { createTranslator, interpolate, pluralForm, splitRich } from "./translate";

const es = {
  admin: {
    usersCount: "Cantidad de usuarios: {count}",
    greeting: "Hola {name}",
    title: "Resumen",
    stamps: { one: "{count} sello", other: "{count} sellos" },
    rewards: { zero: "Sin premios", one: "Un premio de {business}", other: "{count} premios" },
    terms: "Lee los <terms>términos</terms> antes",
  },
} as const;

const en = {
  admin: {
    usersCount: "Number of users: {count}",
    greeting: "Hi {name}",
    title: "Overview",
    stamps: { one: "{count} stamp", other: "{count} stamps" },
    rewards: { zero: "No rewards", one: "One reward from {business}", other: "{count} rewards" },
    terms: "Read the <terms>terms</terms> first",
  },
} as const;

describe("createTranslator", () => {
  it("fills the placeholders and formats numbers for the language", () => {
    expect(createTranslator<typeof es>("es", es)("admin.usersCount", { count: 12345 })).toBe(
      "Cantidad de usuarios: 12.345",
    );
    expect(createTranslator<typeof es>("en", en)("admin.usersCount", { count: 12345 })).toBe(
      "Number of users: 12,345",
    );
  });

  it("returns the text as is when it has no placeholders", () => {
    const t = createTranslator<typeof es>("en", en);
    expect(t("admin.title")).toBe("Overview");
    expect(t.locale).toBe("en");
  });

  it("picks the plural form from the count", () => {
    const t = createTranslator<typeof es>("es", es);
    expect(t("admin.stamps", { count: 1 })).toBe("1 sello");
    expect(t("admin.stamps", { count: 3 })).toBe("3 sellos");
    expect(t("admin.rewards", { count: 0, business: "Café" })).toBe("Sin premios");
    expect(t("admin.rewards", { count: 1, business: "Café" })).toBe("Un premio de Café");
  });

  it("a text outside the loaded namespaces comes back as its key", () => {
    expect(createTranslator<typeof es>("es", {})("admin.title")).toBe("admin.title");
  });

  it("requires a value for each placeholder", () => {
    const t = createTranslator<typeof es>("es", es);
    expectTypeOf(t<"admin.greeting">)
      .parameter(1)
      .toEqualTypeOf<{ name: string | number | Date }>();
    // @ts-expect-error `name` is missing
    t("admin.greeting");
    // @ts-expect-error `total` is not in the text
    t("admin.usersCount", { total: 3 });
    // @ts-expect-error a plural always needs `count`
    t("admin.stamps", {});
    // @ts-expect-error no such key
    t("admin.nope");
  });
});

describe("interpolate", () => {
  it("formats dates for the language", () => {
    const date = new Date(2026, 9, 22);
    expect(interpolate("es", "Desde {date}", { date })).toBe("Desde 22 oct 2026");
    expect(interpolate("en", "Since {date}", { date })).toBe("Since Oct 22, 2026");
  });

  it("leaves a placeholder without a value in sight", () => {
    expect(interpolate("es", "Hola {name}")).toBe("Hola {name}");
  });
});

describe("pluralForm", () => {
  it("uses `other` when the form the language asks for is missing", () => {
    // Spanish has a "many" form for millions.
    expect(pluralForm("es", { one: "uno", other: "varios" }, 1_000_000)).toBe("varios");
  });
});

describe("splitRich", () => {
  it("replaces each tag with what its function returns", () => {
    expect(splitRich(es.admin.terms, { terms: (text) => text.toUpperCase() })).toEqual([
      "Lee los ",
      { tag: "terms", node: "TÉRMINOS" },
      " antes",
    ]);
  });

  it("a tag without a function stays as text", () => {
    expect(splitRich("Hola <b>mundo</b>", {})).toEqual(["Hola ", "mundo"]);
  });
});
