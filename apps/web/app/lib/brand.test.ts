import { readFileSync } from "node:fs";
import { emailPalette } from "@monaztore/email/brand";
import { describe, expect, it } from "vitest";
import { contrastRatio, themeBackground } from "./brand";

type Tokens = Map<string, { light: string; dark: string }>;

const css = readFileSync(new URL("../app.css", import.meta.url), "utf8");

/** Reads `--name: light-dark(#light, #dark)` tokens from the `:root { … }` block of app.css. */
function readTokens(): Tokens {
  const block = css.match(/^:root \{([\s\S]*?)^\}/m)?.[1];
  if (!block) throw new Error("app.css has no :root block");
  const tokens: Tokens = new Map();
  for (const [, name, light, dark] of block.matchAll(
    /--([\w-]+):\s*light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)/gi,
  )) {
    if (name && light && dark) tokens.set(name, { light, dark });
  }
  return tokens;
}

const tokens = readTokens();
const token = (name: string) => {
  const value = tokens.get(name);
  if (!value) throw new Error(`app.css has no light-dark() token --${name}`);
  return value;
};

// [text, surface]: every text token must be readable on every surface it is used on. A new text
// or background token goes here.
const textPairs: [string, string][] = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "muted"],
  ["accent-foreground", "accent"],
  ["destructive", "background"],
  ["destructive", "card"],
  ["destructive-foreground", "destructive"],
  ["warning-foreground", "warning"],
  ["link", "background"],
  ["link", "card"],
  ["nav-active-foreground", "nav-active"],
  ["foreground", "sidebar"],
  ["muted-foreground", "sidebar"],
];

// [graphic, surface]: icons, focus rings and input borders need 3:1 (WCAG 1.4.11).
const graphicPairs: [string, string][] = [
  ["ring", "background"],
  ["ring", "card"],
  ["input", "background"],
  ["input", "card"],
];

describe("contrastRatio", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });
});

describe.each(["light", "dark"] as const)("%s theme", (theme) => {
  it.each(textPairs)("%s on %s meets AA for text (4.5:1)", (text, surface) => {
    expect(contrastRatio(token(text)[theme], token(surface)[theme])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(graphicPairs)("%s on %s meets 3:1 for graphics", (graphic, surface) => {
    expect(contrastRatio(token(graphic)[theme], token(surface)[theme])).toBeGreaterThanOrEqual(3);
  });
});

describe("theme-color", () => {
  it("matches each theme's background", () => {
    expect(token("background")).toEqual(themeBackground);
  });
});

describe("emails", () => {
  it("use the same colors as the web", () => {
    expect(emailPalette.page).toEqual({
      light: token("muted").light,
      dark: token("background").dark,
    });
    expect(emailPalette.card).toEqual(token("card"));
    expect(emailPalette.text).toEqual(token("foreground"));
    expect(emailPalette.muted).toEqual(token("muted-foreground"));
    expect(emailPalette.primary).toEqual(token("primary"));
    expect(emailPalette.primaryForeground).toEqual(token("primary-foreground"));
    expect(emailPalette.link).toEqual(token("link"));
  });
});
