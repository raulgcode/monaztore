import { createCookie } from "react-router";
import { parseTheme, type Theme } from "./theme";

// Not signed: it only holds a display preference, and the parser rejects anything unexpected.
const themeCookie = createCookie("theme", {
  path: "/",
  sameSite: "lax",
  maxAge: 60 * 60 * 24 * 365,
});

export async function readTheme(request: Request): Promise<Theme> {
  return parseTheme(await themeCookie.parse(request.headers.get("Cookie")));
}

export function themeCookieHeader(theme: Theme): Promise<string> {
  return themeCookie.serialize(theme);
}
