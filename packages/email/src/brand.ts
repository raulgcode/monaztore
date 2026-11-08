/** One color for each theme, like `light-dark()` in the web app. */
export interface ThemeColor {
  light: string;
  dark: string;
}

/**
 * The colors of an email: the web's theme tokens (apps/web/app/app.css). `brand.test.ts` in the
 * web checks they match, so a new brand color is changed in both places.
 */
export interface EmailPalette {
  /** Around the card: `--muted` in light, `--background` in dark. */
  page: ThemeColor;
  /** `--card` */
  card: ThemeColor;
  /** `--foreground` */
  text: ThemeColor;
  /** `--muted-foreground` */
  muted: ThemeColor;
  /** `--primary`: the header and the button. */
  primary: ThemeColor;
  /** `--primary-foreground`: the name in the header and the button's text. */
  primaryForeground: ThemeColor;
  /** `--link` */
  link: ThemeColor;
}

export const emailPalette: EmailPalette = {
  page: { light: "#f4f4f5", dark: "#09090b" },
  card: { light: "#ffffff", dark: "#18181b" },
  text: { light: "#18181b", dark: "#fafafa" },
  muted: { light: "#52525b", dark: "#a1a1aa" },
  primary: { light: "#4338ca", dark: "#a5b4fc" },
  primaryForeground: { light: "#ffffff", dark: "#1e1b4b" },
  link: { light: "#4338ca", dark: "#a5b4fc" },
};
