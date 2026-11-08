import type { MessageKey } from "@monaztore/i18n";
import type { Messages } from "@monaztore/i18n/messages";
import { createRoutesStub, Link } from "react-router";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { translatedRoot } from "~/test/i18n";
import { richText, useLocale, useT } from "./i18n";

// A tagged text the dictionaries don't have yet, sent the way a loader would.
const tagged = { demo: { terms: "Read the <terms>terms</terms> of {business}" } };
const taggedKey = "demo.terms" as MessageKey<Messages>;

function Page() {
  const t = useT();
  return (
    <main lang={useLocale()}>
      <h1>{t("common.notFoundTitle")}</h1>
      <p>{t("common.themeCurrent", { theme: t("common.themeDark") })}</p>
      <p>
        {richText(t, taggedKey, { terms: (text) => <Link to="/terms">{text}</Link> }, {
          business: "Moon Café",
        } as never)}
      </p>
    </main>
  );
}

function renderPage(locale: "es" | "en") {
  const root = translatedRoot(locale);
  const Stub = createRoutesStub([
    {
      id: "root",
      path: "/",
      loader: () => ({ ...root, i18n: { ...root.i18n, ...tagged } }),
      HydrateFallback: () => null,
      Component: Page,
    },
  ]);
  return render(<Stub />);
}

describe("useT", () => {
  it("translates with what the loader sent, in its language", async () => {
    const screen = await renderPage("es");
    await expect
      .element(screen.getByRole("heading"))
      .toHaveTextContent("No encontramos esta página");
    await expect.element(screen.getByText("Tema: Oscuro")).toBeVisible();
    await expect.element(screen.getByRole("main")).toHaveAttribute("lang", "es");
  });

  it("richText turns tags into components and fills the placeholders", async () => {
    const screen = await renderPage("en");
    await expect
      .element(screen.getByRole("link", { name: "terms" }))
      .toHaveAttribute("href", "/terms");
    await expect.element(screen.getByText(/Read the .* of Moon Café/)).toBeVisible();
  });
});
