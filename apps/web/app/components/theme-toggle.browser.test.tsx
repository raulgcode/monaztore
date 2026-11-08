import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import type { Theme } from "~/lib/theme";
import { translatedRoot } from "~/test/i18n";
import { ThemeToggle } from "./theme-toggle";

function renderToggle(theme: Theme, locale: "es" | "en" = "en") {
  let saved: FormData | undefined;
  const Stub = createRoutesStub([
    {
      id: "root",
      path: "/",
      loader: () => translatedRoot(locale, { theme }),
      HydrateFallback: () => null,
      children: [
        { index: true, Component: () => <ThemeToggle /> },
        {
          path: "theme",
          action: async ({ request }) => {
            saved = await request.formData();
            return null;
          },
        },
      ],
    },
  ]);
  return { screen: render(<Stub />), saved: () => saved };
}

describe("ThemeToggle", () => {
  it.each([
    ["system", "Theme: System. Switch to light"],
    ["light", "Theme: Light. Switch to dark"],
    ["dark", "Theme: Dark. Switch to system"],
  ] as const)("with the %s theme it says which one comes next", async (theme, name) => {
    const { screen } = renderToggle(theme);
    await expect.element((await screen).getByRole("button", { name })).toBeVisible();
  });

  it("reads in Spanish when the page is in Spanish", async () => {
    const { screen } = renderToggle("dark", "es");
    const name = "Tema: Oscuro. Cambiar a sistema";
    await expect.element((await screen).getByRole("button", { name })).toBeVisible();
  });

  it("sends the next theme and the current page", async () => {
    const { screen, saved } = renderToggle("light");
    await (await screen).getByRole("button").click();

    await expect.poll(() => saved()?.get("theme")).toBe("dark");
    expect(saved()?.get("redirectTo")).toBe("/");
  });
});
