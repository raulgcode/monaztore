import { createRoutesStub, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { translatedRoot } from "~/test/i18n";
import { StoreSearch } from "./store-search";

const products = [
  { slug: "camiseta-tica", name: "Camiseta Tica", price: 900_000, imageUrl: "/media/a.webp" },
  { slug: "taza-pura-vida", name: "Taza Pura Vida", price: null, imageUrl: null },
];

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

function renderSearch(locale: "en" | "es" = "en") {
  const asked: string[] = [];
  const Stub = createRoutesStub([
    {
      id: "root",
      path: "/",
      loader: () => translatedRoot(locale, {}, ["common", "storefront"]),
      HydrateFallback: () => null,
      Component: () => (
        <>
          <StoreSearch currency="CRC" />
          <Where />
        </>
      ),
      children: [
        { index: true, Component: () => null },
        { path: "products", Component: () => null },
        { path: "products/:slug", Component: () => null },
        {
          path: "search",
          loader: ({ request }) => {
            const q = new URL(request.url).searchParams.get("q") ?? "";
            asked.push(q);
            return { q, products: products.filter((p) => p.name.toLowerCase().includes(q)) };
          },
        },
      ],
    },
  ]);
  return { screen: render(<Stub initialEntries={["/"]} />), asked };
}

describe("StoreSearch", () => {
  it("suggests products with a photo and price once two letters are typed, and asks once per pause", async () => {
    const { screen, asked } = renderSearch();
    const box = (await screen).getByRole("combobox", { name: "Search products" });

    await userEvent.type(box, "t");
    await expect.element(box).toHaveAttribute("aria-expanded", "false");
    await userEvent.type(box, "a");

    const list = (await screen).getByRole("listbox", { name: "Suggestions" });
    await expect.element(list.getByRole("option").first()).toHaveTextContent("Camiseta Tica₡9,000");
    await expect.element(list.getByRole("option").nth(1)).toHaveTextContent("Taza Pura Vida");
    await expect
      .element(list.getByRole("option").last())
      .toHaveTextContent("See all results for “ta”");
    // The photo is decorative (the name says it all), so it has no role: found by its tag.
    expect(list.element().querySelector("img")?.getAttribute("src")).toBe("/media/a.webp?w=160");
    await expect.element(box).toHaveAttribute("aria-expanded", "true");
    expect(asked).toEqual(["ta"]);
  });

  it("goes through the options with the arrows, wraps back to the field, and Enter opens the marked one", async () => {
    const { screen } = renderSearch();
    const page = await screen;
    const box = page.getByRole("combobox", { name: "Search products" });
    await userEvent.type(box, "ta");
    await expect.element(page.getByRole("option").first()).toBeVisible();

    await userEvent.keyboard("{ArrowUp}");
    await expect
      .element(page.getByRole("option", { selected: true }))
      .toHaveTextContent("See all results for “ta”");
    await userEvent.keyboard("{ArrowDown}");
    expect(box.element().getAttribute("aria-activedescendant")).toBeNull();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    await expect
      .element(page.getByRole("option", { selected: true }))
      .toHaveTextContent("Taza Pura Vida");
    expect(box.element().getAttribute("aria-activedescendant")).toBe(
      page.getByRole("option", { selected: true }).element().id,
    );

    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByTestId("where")).toHaveTextContent("/products/taza-pura-vida");
  });

  it("closes with Escape, clears with a second Escape, and a tap on “See all” searches", async () => {
    const { screen } = renderSearch();
    const page = await screen;
    const box = page.getByRole("combobox", { name: "Search products" });
    await userEvent.type(box, "ta");
    await expect.element(page.getByRole("listbox")).toBeVisible();

    await userEvent.keyboard("{Escape}");
    await expect.element(box).toHaveAttribute("aria-expanded", "false");
    await expect.element(box).toHaveValue("ta");
    await userEvent.keyboard("{Escape}");
    await expect.element(box).toHaveValue("");

    await userEvent.type(box, "pura");
    await page.getByRole("option", { name: "See all results for “pura”" }).click();
    await expect.element(page.getByTestId("where")).toHaveTextContent("/products?q=pura");
  });

  it("speaks Spanish in a Spanish store", async () => {
    const page = await renderSearch("es").screen;
    const box = page.getByRole("combobox", { name: "Buscar productos" });
    await userEvent.type(box, "zz");
    await expect
      .element(page.getByText("Sin sugerencias. Presiona Enter para buscar."))
      .toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: "Borrar la búsqueda" })).toBeVisible();
  });
});
