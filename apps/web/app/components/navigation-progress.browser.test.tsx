import { createRoutesStub, Link, Outlet } from "react-router";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { NavigationProgress } from "./navigation-progress";

function renderWithSlowPage() {
  let finish = () => {};
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <>
          <NavigationProgress />
          <Link to="/slow">Go</Link>
          <Outlet />
        </>
      ),
      children: [
        {
          path: "slow",
          loader: () =>
            new Promise<null>((resolve) => {
              finish = () => resolve(null);
            }),
          Component: () => <h1>Slow page</h1>,
        },
      ],
    },
  ]);
  return { screen: render(<Stub />), finish: () => finish() };
}

describe("NavigationProgress", () => {
  it("at rest it shows no bar and announces nothing", async () => {
    const screen = await renderWithSlowPage().screen;
    await expect.element(screen.getByRole("status")).toHaveTextContent("");
    expect(document.querySelector(".navigation-progress-bar")).toBeNull();
  });

  it("while the page loads it shows the bar and announces 'Loading…'", async () => {
    const { screen, finish } = renderWithSlowPage();
    const view = await screen;
    await view.getByRole("link", { name: "Go" }).click();

    await expect.element(view.getByRole("status")).toHaveTextContent("Loading…");
    expect(document.querySelector('[data-navigation-progress="loading"]')).not.toBeNull();

    finish();
    await expect.element(view.getByRole("heading", { name: "Slow page" })).toBeVisible();
    await expect.element(view.getByRole("status")).toHaveTextContent("");
    expect(document.querySelector(".navigation-progress-bar")).toBeNull();
  });
});
