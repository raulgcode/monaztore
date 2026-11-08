export const themes = ["system", "light", "dark"] as const;

/** `system` follows the OS (prefers-color-scheme); the others force a theme. */
export type Theme = (typeof themes)[number];

export function parseTheme(value: unknown): Theme {
  return themes.find((theme) => theme === value) ?? "system";
}

export function nextTheme(theme: Theme): Theme {
  return themes[(themes.indexOf(theme) + 1) % themes.length] ?? "system";
}

/** The translation of each theme's name, for `t(themeLabels[theme])`. */
export const themeLabels = {
  system: "common.themeSystem",
  light: "common.themeLight",
  dark: "common.themeDark",
} as const satisfies Record<Theme, string>;
