import { describe, expect, it } from "vitest";
import { negotiateLocale, parseLocale, resolveLocale } from "./locale";

describe("parseLocale", () => {
  it.each([
    ["es", "es"],
    ["en", "en"],
    ["es_cr", "es"],
    ["es-MX", "es"],
    ["es-419", "es"],
    ["EN_us", "en"],
    [" en-GB ", "en"],
  ])("reads %s as %s", (value, locale) => {
    expect(parseLocale(value)).toBe(locale);
  });

  it.each([["de"], [""], [undefined], [42], ["español"]])("rejects %s", (value) => {
    expect(parseLocale(value)).toBeUndefined();
  });
});

describe("negotiateLocale", () => {
  it("picks the supported language with the highest weight", () => {
    expect(negotiateLocale("de-DE,de;q=0.9,en;q=0.8,es;q=0.7")).toBe("en");
    expect(negotiateLocale("en;q=0.5, es;q=0.6")).toBe("es");
  });

  it("on equal weight the first one wins", () => {
    expect(negotiateLocale("en-US, es")).toBe("en");
  });

  it("ignores q=0 and never makes up a language", () => {
    expect(negotiateLocale("en;q=0, es")).toBe("es");
    expect(negotiateLocale("en;q=0, de")).toBeUndefined();
    expect(negotiateLocale("")).toBeUndefined();
    expect(negotiateLocale(null)).toBeUndefined();
  });
});

describe("resolveLocale", () => {
  it("the cookie wins over the account and the browser", () => {
    expect(resolveLocale({ cookie: "en", user: "es", acceptLanguage: "es" })).toBe("en");
  });

  it("without a cookie it uses the account, and without one the browser", () => {
    expect(resolveLocale({ user: "en", acceptLanguage: "es" })).toBe("en");
    expect(resolveLocale({ cookie: "xx", acceptLanguage: "en-US" })).toBe("en");
    expect(resolveLocale({ acceptLanguage: "es-MX" })).toBe("es");
  });

  it("a browser in a language we don't have, or none, gets English", () => {
    expect(resolveLocale({})).toBe("en");
    expect(resolveLocale({ acceptLanguage: "pt-BR,pt;q=0.9" })).toBe("en");
  });
});
