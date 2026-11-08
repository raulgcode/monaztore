import {
  buildClave,
  buildExactFacturaXml,
  buildExactTiqueteXml,
  DocumentType,
  Situation,
} from "@dojocoding/hacienda-sdk";

/**
 * Builds a store's electronic receipt in Hacienda's v4.4 format, from what Monaztore knows:
 * prices in minor units that already include IVA (in Costa Rica the price on the shelf is the
 * final one). Only the ordinary case for now: goods or services at the general IVA rate (13 %),
 * paid in full. The XML comes from @dojocoding/hacienda-sdk's exact builders, which recalculate
 * every amount from these facts and refuse anything outside that case.
 */

/** 01 physical person (9 digits), 02 company (10), 03 DIMEX (11–12), 04 NITE (10). */
export type IdType = "01" | "02" | "03" | "04";

/** "invoice" is a Factura Electrónica (01, the buyer has an ID); "ticket" a Tiquete (04). */
export type DocumentKind = "invoice" | "ticket";

export const documentTypeCode: Record<DocumentKind, "01" | "04"> = {
  invoice: DocumentType.FACTURA_ELECTRONICA,
  ticket: DocumentType.TIQUETE_ELECTRONICO,
};

export interface Issuer {
  idType: IdType;
  idNumber: string;
  name: string;
  commercialName?: string;
  email: string;
  phone?: string;
  /** Six digits, the one Hacienda has for the taxpayer (CIIU 4). */
  activityCode: string;
  province: string;
  canton: string;
  district: string;
  address: string;
}

export interface Receiver {
  idType: IdType;
  idNumber: string;
  name: string;
  email?: string;
}

export interface ComprobanteLine {
  detail: string;
  /** Thirteen digits from Hacienda's CABYS catalog. */
  cabys: string;
  quantity: number;
  /** What one unit costs with IVA, in minor units (céntimos). */
  unitPriceMinor: number;
  service?: boolean;
}

/** How it was paid: 01 cash, 02 card, 04 transfer, 06 SINPE Móvil, 99 other. */
export type PaymentCode = "01" | "02" | "04" | "06" | "99";

export interface ComprobanteInput {
  kind: DocumentKind;
  issuer: Issuer;
  /** Required for an invoice; a ticket may name the buyer without an ID. */
  receiver?: Receiver;
  /** Who provides the software (ProveedorSistemas): Monaztore's ID, or the issuer's own. */
  providerId: string;
  /** 1–999 and 1–99999, as in the consecutive number. */
  branch: number;
  terminal: number;
  /** The document's own number, per kind: 1, 2, 3… */
  number: number;
  issuedAt: Date;
  /** Eight digits that make the clave unguessable. */
  securityCode: string;
  currency: "CRC" | "USD";
  /** Colones per dollar for USD; "1" for colones. */
  exchangeRate: string;
  payment: PaymentCode;
  lines: readonly ComprobanteLine[];
}

export interface Comprobante {
  clave: string;
  consecutive: string;
  /** Costa Rica time with its offset, as Hacienda wants it: 2026-11-08T09:30:00-06:00. */
  issuedAt: string;
  /** Unsigned XML. */
  xml: string;
  /** The total in the XML, with five decimals. */
  total: string;
}

const SCALE = 100_000n;

/** Half up, like the SDK and Hacienda. */
function roundDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

function decimal(scaled: bigint): string {
  return `${scaled / SCALE}.${(scaled % SCALE).toString().padStart(5, "0")}`;
}

/** A price with 13 % IVA in céntimos → the price before IVA, with five decimals. */
export function priceBeforeTax(minor: number): bigint {
  // minor / 100 colones → × 10⁵ → ÷ 1.13
  return roundDiv(BigInt(minor) * 100_000n, 113n);
}

/** The same total the SDK computes: each line rounds its gross and its tax to five decimals. */
export function comprobanteTotal(lines: readonly ComprobanteLine[]): bigint {
  let total = 0n;
  for (const line of lines) {
    const gross = BigInt(line.quantity) * priceBeforeTax(line.unitPriceMinor);
    total += gross + roundDiv(gross * 13n, 100n);
  }
  return total;
}

/** 001 + 00001 + 04 + 0000000012: branch, terminal, document type and number. */
export function consecutiveOf(
  kind: DocumentKind,
  branch: number,
  terminal: number,
  number: number,
) {
  return `${String(branch).padStart(3, "0")}${String(terminal).padStart(5, "0")}${documentTypeCode[kind]}${String(number).padStart(10, "0")}`;
}

/** Costa Rica has been UTC−6 all year since 1992. */
export function costaRicaTime(date: Date): string {
  const local = new Date(date.getTime() - 6 * 60 * 60 * 1000);
  return `${local.toISOString().slice(0, 19)}-06:00`;
}

function phoneOf(phone: string | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "").replace(/^506(?=\d{8}$)/, "");
  return /^\d{8}$/.test(digits) ? { codigoPais: "506", numTelefono: digits } : undefined;
}

export function buildComprobante(input: ComprobanteInput): Comprobante {
  if (input.kind === "invoice" && !input.receiver) {
    throw new Error("An invoice needs the buyer's ID; without it, issue a ticket");
  }
  const { clave, consecutive } = comprobanteKeys({
    kind: input.kind,
    idNumber: input.issuer.idNumber,
    branch: input.branch,
    terminal: input.terminal,
    number: input.number,
    issuedAt: input.issuedAt,
    securityCode: input.securityCode,
  });
  const issuedAt = costaRicaTime(input.issuedAt);
  const total = decimal(comprobanteTotal(input.lines));
  const { issuer, receiver } = input;
  const telefono = phoneOf(issuer.phone);
  const emisor = {
    nombre: issuer.name,
    ...(issuer.commercialName ? { nombreComercial: issuer.commercialName } : {}),
    identificacion: { tipo: issuer.idType, numero: issuer.idNumber },
    ubicacion: {
      provincia: issuer.province,
      canton: issuer.canton,
      distrito: issuer.district,
      otrasSenas: issuer.address,
    },
    ...(telefono ? { telefono } : {}),
    correoElectronico: issuer.email,
  };
  const receptor = receiver
    ? {
        nombre: receiver.name,
        identificacion: { tipo: receiver.idType, numero: receiver.idNumber },
        ...(receiver.email ? { correoElectronico: receiver.email } : {}),
      }
    : undefined;
  const document = {
    clave,
    proveedorSistemas: input.providerId,
    codigoActividadEmisor: issuer.activityCode,
    numeroConsecutivo: consecutive,
    fechaEmision: issuedAt,
    emisor,
    ...(receptor ? { receptor } : {}),
    condicionVenta: "01",
    detalleServicio: input.lines.map((line, index) => ({
      numeroLinea: index + 1,
      codigoCabys: line.cabys,
      cantidad: String(line.quantity),
      unidadMedida: line.service ? "Sp" : "Unid",
      detalle: line.detail.slice(0, 200),
      precioUnitario: decimal(priceBeforeTax(line.unitPriceMinor)),
      impuesto: [{ codigo: "01", codigoTarifaIVA: "08", tarifa: "13" }],
      esServicio: line.service ?? false,
    })),
    codigoTipoMoneda: { codigoMoneda: input.currency, tipoCambio: input.exchangeRate },
    medioPago: [{ tipoMedioPago: input.payment, totalMedioPago: total }],
  };
  const xml =
    input.kind === "invoice"
      ? buildExactFacturaXml({
          ...document,
          caseCode: "FE-domestic-ordinary-iva13-v1",
        } as unknown as Parameters<typeof buildExactFacturaXml>[0])
      : buildExactTiqueteXml({
          ...document,
          caseCode: "TE-domestic-ordinary-iva13-v1",
        } as unknown as Parameters<typeof buildExactTiqueteXml>[0]);
  return { clave, consecutive, issuedAt, xml, total };
}

/** The clave and consecutive number of a document, fixed when it is queued. */
export function comprobanteKeys(input: {
  kind: DocumentKind;
  idNumber: string;
  branch: number;
  terminal: number;
  number: number;
  issuedAt: Date;
  securityCode: string;
}) {
  const clave = buildClave({
    date: input.issuedAt,
    taxpayerId: input.idNumber,
    branch: String(input.branch).padStart(3, "0"),
    pos: String(input.terminal).padStart(5, "0"),
    documentType: documentTypeCode[input.kind],
    sequence: input.number,
    situation: Situation.NORMAL,
    securityCode: input.securityCode,
  } as unknown as Parameters<typeof buildClave>[0]);
  return {
    clave,
    consecutive: consecutiveOf(input.kind, input.branch, input.terminal, input.number),
  };
}
