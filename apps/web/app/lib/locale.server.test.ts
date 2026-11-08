import { RouterContextProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { localeContext } from "../context";
import {
  applyAccountLocale,
  localeCookieHeader,
  localeMiddleware,
  readLocaleCookie,
  translations,
} from "./locale.server";

const cookieOf = async (locale: "es" | "en") =>
  (await localeCookieHeader(locale)).split(";")[0] ?? "";

async function run(headers: HeadersInit = {}) {
  const context = new RouterContextProvider();
  const request = new Request("http://localhost/", { headers });
  const response = await localeMiddleware(
    { request, context, params: {}, pattern: "/" } as unknown as Parameters<
      typeof localeMiddleware
    >[0],
    async () => new Response("ok"),
  );
  return { context, request, response: response as Response };
}

describe("language cookie", () => {
  it("reads the saved language and lasts a year", async () => {
    const setCookie = await localeCookieHeader("en");
    expect(setCookie).toMatch(/Max-Age=31536000/);
    expect(setCookie).toMatch(/SameSite=Lax/);
    const request = new Request("http://localhost/", { headers: { Cookie: await cookieOf("en") } });
    await expect(readLocaleCookie(request)).resolves.toBe("en");
  });

  it("ignores a value that isn't a language", async () => {
    const request = new Request("http://localhost/", { headers: { Cookie: "lang=ImRlIg==" } });
    await expect(readLocaleCookie(request)).resolves.toBeUndefined();
  });
});

describe("localeMiddleware", () => {
  it("uses the cookie before the browser", async () => {
    const { context } = await run({
      Cookie: await cookieOf("es"),
      "Accept-Language": "en-US,en;q=0.9",
    });
    expect(context.get(localeContext)).toBe("es");
  });

  it("without a cookie, the browser's language; English if we don't have it", async () => {
    expect((await run({ "Accept-Language": "en-GB" })).context.get(localeContext)).toBe("en");
    expect((await run({ "Accept-Language": "es-MX" })).context.get(localeContext)).toBe("es");
    expect((await run({ "Accept-Language": "de" })).context.get(localeContext)).toBe("en");
  });

  it("tells caches the response varies with the language", async () => {
    const { response } = await run();
    expect(response.headers.get("Vary")).toBe("Accept-Language, Cookie");
  });
});

describe("applyAccountLocale", () => {
  it("on a device without a cookie it uses the account's language", async () => {
    const { context, request } = await run({ "Accept-Language": "es" });
    await applyAccountLocale(request, context, { locale: "en" });
    expect(context.get(localeContext)).toBe("en");
  });

  it("this device's cookie wins over the account", async () => {
    const { context, request } = await run({ Cookie: await cookieOf("es") });
    await applyAccountLocale(request, context, { locale: "en" });
    expect(context.get(localeContext)).toBe("es");
  });

  it("without a language in the account nothing changes", async () => {
    const { context, request } = await run({ "Accept-Language": "en" });
    await applyAccountLocale(request, context, { locale: null });
    expect(context.get(localeContext)).toBe("en");
  });
});

describe("translations", () => {
  it("sends only the namespaces asked for, in the page's language", async () => {
    const { context } = await run({ "Accept-Language": "en" });
    const sent = translations(context, "common");
    expect(Object.keys(sent)).toEqual(["common"]);
    expect(sent.common.errorTitle).toBe("Oops, something went wrong");
  });
});
