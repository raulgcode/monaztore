import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { emailPalette } from "../brand";
import { renderEmail } from "../render";
import { AccountEmail, accountEmailSubject } from "./account";
import { DownloadsEmail, downloadsMessage } from "./downloads";
import { einvoiceMessage } from "./einvoice";
import { MagicLinkEmail, magicLinkSubject } from "./magic-link";
import { orderPlacedMessage, storeOrderMessage } from "./orders";

const url = "https://app.monaztore.com/api/auth/verify?token=abc&x=1";

describe("brand in every email", () => {
  it.each([
    createElement(MagicLinkEmail, { url }),
    createElement(AccountEmail, { kind: "verify", name: "Ana", url }),
    createElement(AccountEmail, { kind: "reset", name: "Ana", url }),
    createElement(DownloadsEmail, {
      storeName: "Tienda",
      orderNumber: 1001,
      name: "Ana",
      url,
      files: ["guide.pdf"],
    }),
  ])("$type.name carries the brand color, dark mode and the link spelled out", async (email) => {
    const { html, text } = await renderEmail(email);
    expect(html).toContain(`background-color:${emailPalette.primary.light}`);
    expect(html).toContain("@media (prefers-color-scheme: dark)");
    expect(html).toContain('<meta name="color-scheme" content="light dark">');
    // The button and the link spelled out below it, with the & escaped in the HTML.
    expect(html).toContain('href="https://app.monaztore.com/api/auth/verify?token=abc&amp;x=1"');
    expect(text).toContain(url);
  });
});

describe("emails in the recipient's language", () => {
  it("the sign-in link goes out in English by default", async () => {
    const { html, text } = await renderEmail(createElement(MagicLinkEmail, { url }));
    expect(magicLinkSubject("en")).toBe("Your sign-in link");
    expect(html).toContain('lang="en"');
    expect(text).toContain("Sign in with one tap");
  });

  it("and in Spanish when asked for from a page in Spanish", async () => {
    const element = createElement(MagicLinkEmail, { url, locale: "es" });
    const { html, text } = await renderEmail(element);
    expect(magicLinkSubject("es")).toBe("Tu enlace para entrar");
    expect(html).toContain('lang="es"');
    expect(text).toContain("Entra con un toque");
  });

  it("confirming the email greets them by name", async () => {
    const element = createElement(AccountEmail, { kind: "verify", name: "Ana", url });
    const { text } = await renderEmail(element);
    expect(accountEmailSubject("verify", "en")).toBe("Confirm your email");
    expect(text).toContain("Hi, Ana");
    expect(text).toContain("Confirm email");
  });

  it("choosing a new password, in Spanish", async () => {
    const element = createElement(AccountEmail, { kind: "reset", name: "Ana", url, locale: "es" });
    const { text } = await renderEmail(element);
    expect(accountEmailSubject("reset", "es")).toBe("Elige una nueva contraseña");
    expect(text).toContain("Elegir contraseña");
  });
});

describe("the buyer's electronic invoice", () => {
  it("names the store, the order and the clave, in the buyer's language", async () => {
    const message = einvoiceMessage({
      locale: "es",
      kind: "invoice",
      storeName: "Tienda Bonita",
      orderNumber: 1001,
      consecutive: "00100001010000000001",
      clave: "5".repeat(50),
    });
    expect(message.subject).toBe("Tienda Bonita: tu factura electrónica del pedido #1001");
    const { html, text } = await renderEmail(message.react);
    expect(html).toContain('lang="es"');
    expect(text).toContain("00100001010000000001");
    expect(text).toContain("5".repeat(50));
  });
  it("a receipt says so", () => {
    const message = einvoiceMessage({
      locale: "en",
      kind: "ticket",
      storeName: "Shop",
      orderNumber: 7,
      consecutive: "1",
      clave: "2",
    });
    expect(message.subject).toBe("Shop: your electronic receipt for order #7");
  });
});

describe("the downloads of a paid order", () => {
  it("names the store, the order and each file, in the buyer's language", async () => {
    const message = downloadsMessage({
      locale: "es",
      storeName: "Super Chiva",
      orderNumber: 1004,
      name: "Ana",
      url: "https://superchiva.cr/downloads/abc",
      files: ["Guía.pdf", "Plantillas.zip"],
    });
    const { text } = await renderEmail(message.react);
    expect(message.subject).toBe("Super Chiva: tus descargas del pedido #1004");
    expect(text).toContain("Hola, Ana: tus archivos están listos");
    expect(text).toContain("Guía.pdf");
    expect(text).toContain("Plantillas.zip");
    expect(text).toContain("https://superchiva.cr/downloads/abc");
  });
});

describe("an order's emails", () => {
  const lines = [
    { label: "Medias Animanía × 2", total: "₡9 000" },
    { label: "Taza", total: "₡6 000" },
  ];

  it("gives the shopper what they bought, how to pay and their order's link, in their language", async () => {
    const message = orderPlacedMessage({
      locale: "es",
      storeName: "Super Chiva",
      orderNumber: 1001,
      name: "Ana",
      lines,
      total: "₡15 000",
      payTo: { sinpe: { phone: "8888-1234", holder: "Super Chiva S.A." } },
      url: "https://superchivacr.com/orders/abc",
    });
    const { text } = await renderEmail(message.react);
    expect(message.subject).toBe("Super Chiva: recibimos tu pedido #1001");
    expect(text).toContain("Gracias, Ana");
    expect(text).toContain("Medias Animanía × 2: ₡9 000");
    expect(text).toContain("Total: ₡15 000");
    expect(text).toContain("SINPE Móvil al 8888-1234, a nombre de Super Chiva S.A.");
    expect(text).not.toContain("IBAN");
    expect(text).toContain("https://superchivacr.com/orders/abc");
  });

  it("tells a shopper paying on delivery that they pay when it arrives, with the store's note", async () => {
    const message = orderPlacedMessage({
      locale: "es",
      storeName: "Super Chiva",
      orderNumber: 1002,
      name: "Ana",
      lines,
      total: "₡15 000",
      payTo: { cash: { note: "Efectivo o SINPE al mensajero" } },
      url: "https://superchivacr.com/orders/abc",
    });
    const { text } = await renderEmail(message.react);
    expect(text).toContain("Pagas ₡15 000 cuando lo recibas");
    expect(text).toContain("Efectivo o SINPE al mensajero");
    expect(text).not.toContain("comprobante");
  });

  it("tells the store a new order came in, with who placed it and a link to it", async () => {
    const message = storeOrderMessage({
      locale: "en",
      kind: "placed",
      storeName: "Super Chiva",
      orderNumber: 1001,
      customerName: "Ana Mora",
      customerEmail: "ana@example.com",
      lines,
      total: "₡15,000",
      url: "https://app.monaztore.com/app/superchiva/orders/1001",
    });
    const { text } = await renderEmail(message.react);
    expect(message.subject).toBe("Super Chiva: new order #1001");
    expect(text).toContain("Ana Mora (ana@example.com) placed an order for ₡15,000:");
    expect(text).toContain("https://app.monaztore.com/app/superchiva/orders/1001");
  });

  it("tells the store the shopper sent a payment reference to check", async () => {
    const message = storeOrderMessage({
      locale: "es",
      kind: "reference",
      storeName: "Super Chiva",
      orderNumber: 1001,
      customerName: "Ana Mora",
      customerEmail: "ana@example.com",
      lines,
      total: "₡15 000",
      reference: "123456",
      url: "https://app.monaztore.com/app/superchiva/orders/1001",
    });
    const { text } = await renderEmail(message.react);
    expect(message.subject).toBe("Super Chiva: el pedido #1001 dice que ya pagó");
    expect(text).toContain("Ana Mora mandó el pago de ₡15 000 con el comprobante 123456.");
  });
});
