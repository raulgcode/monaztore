import type { AcceptedEinvoice } from "@monaztore/core";
import type { SendEmailInput } from "@monaztore/email";
import type { HaciendaGateway } from "@monaztore/hacienda";
import { describe, expect, it, vi } from "vitest";
import { einvoiceNotifier, gatewayCache } from "./einvoices";

const accepted: AcceptedEinvoice = {
  organizationId: "org",
  orderNumber: 1001,
  kind: "invoice",
  consecutive: "00100001010000000001",
  clave: "5".repeat(50),
  email: "ana@example.com",
  locale: "es",
  storeName: "Tienda Bonita",
  signedXml: "<FacturaElectronica/>",
  responseXml: "<MensajeHacienda/>",
};

describe("the buyer's email", () => {
  it("goes in their language with the XML and Hacienda's answer attached", async () => {
    const sent: SendEmailInput[] = [];
    await einvoiceNotifier({ send: async (input) => void sent.push(input) })(accepted);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("ana@example.com");
    expect(sent[0]?.subject).toBe("Tienda Bonita: tu factura electrónica del pedido #1001");
    expect(sent[0]?.attachments?.map((file) => file.filename)).toEqual([
      `${accepted.clave}.xml`,
      `${accepted.clave}-respuesta.xml`,
    ]);
  });
});

describe("gateways", () => {
  it("reuse the one of the same user, and make a new one when the password changes", () => {
    const create = vi.fn(() => ({}) as HaciendaGateway);
    const gateway = gatewayCache(create);
    const credentials = { environment: "sandbox" as const, username: "u", password: "a" };
    const first = gateway(credentials);
    expect(gateway(credentials)).toBe(first);
    gateway({ ...credentials, password: "b" });
    expect(create).toHaveBeenCalledTimes(2);
  });
});
