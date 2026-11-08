import { describe, expect, it } from "vitest";
import { wordPressPageBlocks } from "./pages";

describe("wordPressPageBlocks", () => {
  it("turns a Flatsome accordion into questions and answers", () => {
    const html = `
      <h3 class="accordion_title">Envíos</h3>
      <div class="accordion">
        <div class="accordion-item">
          <a class="accordion-title"><span>¿Cuánto tarda?</span></a>
          <div class="accordion-inner"><p>De 2 a 3 días.</p><ol><li>Pagas</li><li>Enviamos</li></ol></div>
        </div>
        <div class="accordion-item"><a class="accordion-title"> </a></div>
      </div>`;
    const { blocks } = wordPressPageBlocks(html, "FAQs");
    expect(blocks).toEqual([
      { type: "heading", id: "b1", text: "Envíos", level: 3 },
      {
        type: "faq",
        id: "b2",
        items: [{ question: "¿Cuánto tarda?", answer: "De 2 a 3 días.\n1. Pagas\n2. Enviamos" }],
      },
    ]);
  });

  it("keeps text and photos, skips the repeated title and notes forms", () => {
    const html = `<h1>Contáctanos</h1><p>Escríbenos &amp; te respondemos.</p><ul><li>WhatsApp</li></ul>
      <img src="https://i0.wp.com/shop.example/wp-content/a.jpg?w=300" alt="Tienda">
      <div class="wpcf7"><form><input name="x"></form></div><script>alert(1)</script>`;
    const { blocks, dropped } = wordPressPageBlocks(html, "Contáctanos");
    expect(blocks).toEqual([
      {
        type: "text",
        id: "b1",
        html: "<p>Escríbenos &amp; te respondemos.</p>\n<ul><li>WhatsApp</li></ul>",
      },
      {
        type: "image",
        id: "b2",
        url: "https://shop.example/wp-content/a.jpg",
        alt: "Tienda",
        caption: "",
      },
    ]);
    expect(dropped).toEqual(["form"]);
  });

  it("gives nothing for a page with only a form", () => {
    expect(wordPressPageBlocks('<div class="wpcf7"><form></form></div>', "Contacto")).toEqual({
      blocks: [],
      dropped: ["form"],
    });
  });
});
