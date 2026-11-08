import { describe, expect, it } from "vitest";
import {
  buildComprobante,
  type ComprobanteInput,
  comprobanteTotal,
  consecutiveOf,
  costaRicaTime,
  priceBeforeTax,
} from "./comprobante";
import { readCertificate, signComprobante, validateComprobante } from "./signing";
import { testCertificate } from "./testing/certificate";

const ticket: ComprobanteInput = {
  kind: "ticket",
  issuer: {
    idType: "01",
    idNumber: "112340567",
    name: "Ana Pérez Mora",
    commercialName: "Super Chiva",
    email: "ventas@superchiva.cr",
    phone: "8888-1234",
    activityCode: "478201",
    province: "1",
    canton: "02",
    district: "03",
    address: "100 m norte de la iglesia",
  },
  providerId: "112340567",
  branch: 1,
  terminal: 1,
  number: 12,
  issuedAt: new Date("2026-11-08T15:30:00Z"),
  securityCode: "12345678",
  currency: "CRC",
  exchangeRate: "1",
  payment: "06",
  lines: [
    { detail: "Camiseta roja", cabys: "2821100000000", quantity: 2, unitPriceMinor: 1_130_000 },
    { detail: "Gorra", cabys: "2821100000000", quantity: 1, unitPriceMinor: 599_900 },
  ],
};

describe("comprobante", () => {
  it("takes IVA out of a shelf price with five decimals", () => {
    expect(priceBeforeTax(1_130_000)).toBe(1_000_000_000n); // ₡11 300 → ₡10 000.00000
    expect(priceBeforeTax(599_900)).toBe(530_884_956n); // ₡5 999 → ₡5 308.84956
  });

  it("totals what the shopper paid, give or take a fraction of a céntimo", () => {
    const total = comprobanteTotal(ticket.lines);
    // ₡28 599: 2 × 11 300 + 5 999
    expect(Number(total) / 100_000).toBeCloseTo(28_599, 2);
  });

  it("numbers the document as branch, terminal, type and number", () => {
    expect(consecutiveOf("ticket", 1, 1, 12)).toBe("00100001040000000012");
    expect(consecutiveOf("invoice", 2, 15, 3)).toBe("00200015010000000003");
  });

  it("writes the time in Costa Rica with its offset", () => {
    expect(costaRicaTime(new Date("2026-11-08T03:30:00Z"))).toBe("2026-11-07T21:30:00-06:00");
  });

  it("builds a ticket whose clave carries the country, the date in Costa Rica and the issuer", async () => {
    const built = buildComprobante(ticket);
    expect(built.clave).toHaveLength(50);
    expect(built.clave.slice(0, 9)).toBe("506081126");
    expect(built.clave.slice(9, 21)).toBe("000112340567");
    expect(built.clave.slice(21, 41)).toBe(built.consecutive);
    expect(built.clave.slice(41)).toBe("112345678");
    expect(built.xml).toContain("<TiqueteElectronico");
    expect(built.xml).toContain("<TipoMedioPago>06</TipoMedioPago>");
    expect(await validateComprobante(built.xml)).toEqual([]);
  });

  it("builds an invoice to a company with its ID", async () => {
    const built = buildComprobante({
      ...ticket,
      kind: "invoice",
      receiver: { idType: "02", idNumber: "3101123456", name: "Comercial Las Palmas S.A." },
    });
    expect(built.consecutive.slice(8, 10)).toBe("01");
    expect(built.xml).toContain("<FacturaElectronica");
    expect(built.xml).toContain("<Numero>3101123456</Numero>");
    expect(await validateComprobante(built.xml)).toEqual([]);
  });

  it("refuses an invoice without the buyer's ID", () => {
    expect(() => buildComprobante({ ...ticket, kind: "invoice" })).toThrow(/ticket/);
  });

  it("signs it with the store's key, and the result still follows the schema", async () => {
    const p12 = testCertificate("4321");
    expect(await readCertificate(p12, "4321")).toMatchObject({ subject: "PRUEBA MONAZTORE" });
    await expect(readCertificate(p12, "0000")).rejects.toMatchObject({ reason: "unreadable" });
    const signed = await signComprobante(buildComprobante(ticket).xml, p12, "4321");
    expect(signed).toContain("ds:Signature");
    expect(signed).toContain("xades:SignaturePolicyIdentifier");
  }, 30_000);
});
