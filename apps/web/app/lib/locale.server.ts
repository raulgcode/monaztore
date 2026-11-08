import {
  createTranslator,
  type Locale,
  parseLocale,
  resolveLocale,
  type Translation,
} from "@monaztore/i18n";
import { dictionaries, type Messages, type Namespace } from "@monaztore/i18n/messages";
import { createCookie, type MiddlewareFunction, type RouterContextProvider } from "react-router";
import { localeContext } from "../context";
import type { T } from "./i18n";

// Not signed, like `theme`: it only holds a preference and the parser rejects anything else.
const localeCookie = createCookie("lang", {
  path: "/",
  sameSite: "lax",
  maxAge: 60 * 60 * 24 * 365,
});

/** The language picked on this device, if any. */
export async function readLocaleCookie(request: Request): Promise<Locale | undefined> {
  return parseLocale(await localeCookie.parse(request.headers.get("Cookie")));
}

export function localeCookieHeader(locale: Locale): Promise<string> {
  return localeCookie.serialize(locale);
}

/**
 * Decides the page's language once per request: the cookie, else the browser. `requireSession`
 * then prefers the account's language when there's no cookie. Responses vary by both, so no
 * cache serves one language to the other.
 */
export const localeMiddleware: MiddlewareFunction<Response> = async (
  { request, context },
  next,
) => {
  context.set(
    localeContext,
    resolveLocale({
      cookie: await readLocaleCookie(request),
      acceptLanguage: request.headers.get("Accept-Language"),
    }),
  );
  const response = await next();
  try {
    response.headers.append("Vary", "Accept-Language, Cookie");
  } catch {
    // Immutable headers (a fetched Response): nothing to add.
  }
  return response;
};

/** On a device where they never picked one, a signed-in person gets their account's language. */
export async function applyAccountLocale(
  request: Request,
  context: Readonly<RouterContextProvider>,
  user: { locale?: string | null },
) {
  const account = parseLocale(user.locale);
  if (account && !(await readLocaleCookie(request))) context.set(localeContext, account);
}

/**
 * The texts a route sends to the browser: only the namespaces it names, only in the page's
 * language. Return it from the loader as `i18n` and read it with `useT()`.
 */
export function translations<N extends Namespace>(
  context: Readonly<RouterContextProvider>,
  ...namespaces: N[]
): Pick<Translation<Messages>, N> {
  const dictionary = dictionaries[context.get(localeContext)];
  return Object.fromEntries(
    namespaces.map((namespace) => [namespace, dictionary[namespace]]),
  ) as Pick<Translation<Messages>, N>;
}

/** The page's language, for what the server writes itself: an email, a new customer's language. */
export function localeOf(context: Readonly<RouterContextProvider>): Locale {
  return context.get(localeContext);
}

/**
 * `t` for texts the server writes into loader data (a notice, an error message), with the whole
 * dictionary of the page's language. Components translate with `useT()` instead.
 */
export function serverT(context: Readonly<RouterContextProvider>): T {
  const locale = localeOf(context);
  return createTranslator<Messages>(locale, dictionaries[locale]);
}
