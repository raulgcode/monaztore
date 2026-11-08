import type { Locale } from "@monaztore/i18n";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { useT } from "~/lib/i18n";
import { translatedRoot } from "~/test/i18n";
import { ErrorPage } from "./error-page";

function Page({ status }: { status?: number }) {
  return <ErrorPage t={useT()} status={status} />;
}

async function renderError(
  url: string,
  { status, locale = "en" }: { status?: number; locale?: Locale } = {},
) {
  const Stub = createRoutesStub([
    {
      id: "root",
      path: "/",
      loader: () => translatedRoot(locale),
      HydrateFallback: () => null,
      children: [{ path: "*", Component: () => <Page status={status} /> }],
    },
  ]);
  return render(<Stub initialEntries={[url]} />);
}

describe("ErrorPage", () => {
  it("tells the person the page doesn't exist and takes them home", async () => {
    const screen = await renderError("/app/other-workspace", { status: 404 });
    await expect
      .element(screen.getByRole("heading", { level: 1 }))
      .toHaveTextContent("We couldn't find this page");
    await expect.element(screen.getByText("Error 404")).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Go home" }))
      .toHaveAttribute("href", "/");
    await expect.element(screen.getByRole("link", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("offers to retry the same page after an unexpected error", async () => {
    const screen = await renderError("/login?redirectTo=%2Fapp");
    await expect
      .element(screen.getByRole("heading", { level: 1 }))
      .toHaveTextContent("Oops, something went wrong");
    await expect
      .element(screen.getByText("It wasn't your fault. Try again in a moment."))
      .toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Try again" }))
      .toHaveAttribute("href", "/login?redirectTo=%2Fapp");
    await expect
      .element(screen.getByRole("link", { name: "Go home" }))
      .toHaveAttribute("href", "/");
  });

  it("speaks the page's language", async () => {
    const es = await renderError("/app", { locale: "es" });
    await expect
      .element(es.getByRole("heading", { level: 1 }))
      .toHaveTextContent("Ups, algo salió mal");
    await expect.element(es.getByRole("link", { name: "Intentar de nuevo" })).toBeVisible();
  });
});
