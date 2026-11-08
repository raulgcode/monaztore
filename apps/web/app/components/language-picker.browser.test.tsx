import type { Locale } from "@monaztore/i18n";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { translatedRoot } from "~/test/i18n";
import { LanguagePicker } from "./language-picker";

function renderPicker(locale: Locale) {
  let saved: FormData | undefined;
  const Stub = createRoutesStub([
    {
      id: "root",
      path: "/",
      loader: () => translatedRoot(locale),
      HydrateFallback: () => null,
      children: [
        { path: "app/:workspace/settings", Component: () => <LanguagePicker /> },
        {
          path: "locale",
          action: async ({ request }) => {
            saved = await request.formData();
            return null;
          },
        },
      ],
    },
  ]);
  const screen = render(<Stub initialEntries={["/app/acme-x1/settings?tab=1"]} />);
  return { screen, saved: () => saved };
}

describe("LanguagePicker", () => {
  it.each([
    ["en", "Language"],
    ["es", "Idioma"],
  ] as const)(
    "in %s it marks the current language and names each one in itself",
    async (locale, legend) => {
      const screen = await renderPicker(locale).screen;
      const group = screen.getByRole("group", { name: legend });
      await expect
        .element(group.getByRole("radio", { checked: true }))
        .toHaveAttribute("value", locale);
      for (const [name, lang] of [
        ["English", "en"],
        ["Español", "es"],
      ] as const) {
        await expect.element(group.getByText(name, { exact: true })).toHaveAttribute("lang", lang);
      }
    },
  );

  it("saves the language when picked and comes back to the same page", async () => {
    const { screen, saved } = renderPicker("en");
    await (await screen).getByRole("radio", { name: "Español" }).click();

    await expect.poll(() => saved()?.get("locale")).toBe("es");
    expect(saved()?.get("redirectTo")).toBe("/app/acme-x1/settings?tab=1");
  });
});
