import { describe, expect, it } from "vitest";
import { identityProblems, renameText } from "./rename.ts";

const from = { name: "Monaztore", slug: "monaztore", domain: "monaztore.com" };
const to = { name: "Superchiva", slug: "superchiva", domain: "superchiva.cr" };

describe("renameText", () => {
  it.each([
    ['import { db } from "@monaztore/db";', 'import { db } from "@superchiva/db";'],
    [
      "postgres://monaztore:monaztore@localhost:5432/monaztore_test",
      "postgres://superchiva:superchiva@localhost:5432/superchiva_test",
    ],
    ['APP_URL = "https://app.monaztore.com"', 'APP_URL = "https://app.superchiva.cr"'],
    ['poweredBy: "Store made with Monaztore"', 'poweredBy: "Store made with Superchiva"'],
    ['app = "monaztore-web"', 'app = "superchiva-web"'],
    ['singleton("__monaztoreDatabase"', 'singleton("__superchivaDatabase"'],
  ])("%s", (text, expected) => {
    expect(renameText(text, from, to)).toBe(expected);
  });

  it("rewrites the project file itself, so the next rename starts from the new name", () => {
    const file = 'name: "Monaztore",\nslug: "monaztore",\ndomain: "monaztore.com",';
    expect(renameText(file, from, to)).toBe(
      'name: "Superchiva",\nslug: "superchiva",\ndomain: "superchiva.cr",',
    );
  });

  it("replaces in one pass: a new name that holds the old one isn't renamed twice", () => {
    const shop = { name: "Monaztore Shop", slug: "shop", domain: "shop.cr" };
    expect(renameText("Monaztore at monaztore.com, @monaztore/core", from, shop)).toBe(
      "Monaztore Shop at shop.cr, @shop/core",
    );
  });

  it("leaves text without the old name as it was", () => {
    expect(renameText("nothing here", from, to)).toBe("nothing here");
  });
});

describe("identityProblems", () => {
  it("takes a name, a lowercase slug and a bare domain", () => {
    expect(identityProblems(to)).toEqual([]);
  });

  it.each([
    [{ ...to, slug: "super-chiva" }, "slug"],
    [{ ...to, slug: "Superchiva" }, "slug"],
    [{ ...to, slug: "1chiva" }, "slug"],
    [{ ...to, domain: "https://superchiva.cr" }, "domain"],
    [{ ...to, domain: "localhost" }, "domain"],
    [{ ...to, name: " " }, "name"],
  ])("refuses %o (%s)", (identity, field) => {
    expect(identityProblems(identity)).toEqual([expect.stringContaining(field)]);
  });
});
