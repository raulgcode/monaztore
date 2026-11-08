import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { ScrollShadow } from "./scroll-shadow";

function renderScroller(contentWidth: number) {
  return render(
    <ScrollShadow data-testid="wrapper" style={{ width: 200 }}>
      <div style={{ width: contentWidth, height: 20 }}>content</div>
    </ScrollShadow>,
  );
}

const scrollerOf = (wrapper: Element) => wrapper.firstElementChild as HTMLElement;

describe("ScrollShadow", () => {
  it("shows the end shadow when there is more content to the right", async () => {
    const screen = await renderScroller(600);
    const wrapper = screen.getByTestId("wrapper");
    await expect.element(wrapper).toHaveAttribute("data-start", "false");
    await expect.element(wrapper).toHaveAttribute("data-end", "true");
  });

  it("switches sides on scroll and drops it at the end", async () => {
    const screen = await renderScroller(600);
    const wrapper = screen.getByTestId("wrapper");
    const scroller = scrollerOf(wrapper.element());

    scroller.scrollLeft = 100;
    scroller.dispatchEvent(new Event("scroll"));
    await expect.element(wrapper).toHaveAttribute("data-start", "true");
    await expect.element(wrapper).toHaveAttribute("data-end", "true");

    scroller.scrollLeft = scroller.scrollWidth;
    scroller.dispatchEvent(new Event("scroll"));
    await expect.element(wrapper).toHaveAttribute("data-start", "true");
    await expect.element(wrapper).toHaveAttribute("data-end", "false");
  });

  it("shows no shadows when everything fits", async () => {
    const screen = await renderScroller(150);
    const wrapper = screen.getByTestId("wrapper");
    await expect.element(wrapper).toHaveAttribute("data-start", "false");
    await expect.element(wrapper).toHaveAttribute("data-end", "false");
  });
});

describe("ScrollShadow with content that takes no focus (code)", () => {
  it("the keyboard can scroll it: a named, focusable region", async () => {
    const screen = await render(
      <ScrollShadow scrollerLabel="Request example" style={{ width: 200 }}>
        <pre style={{ width: 600 }}>curl …</pre>
      </ScrollShadow>,
    );
    const region = screen.getByRole("region", { name: "Request example" });
    await expect.element(region).toHaveAttribute("tabindex", "0");
  });

  it("without a name it adds nothing to the tab order", async () => {
    const screen = await renderScroller(600);
    const scroller = scrollerOf(screen.getByTestId("wrapper").element());
    expect(scroller.hasAttribute("tabindex")).toBe(false);
  });
});
