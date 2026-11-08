import type { Translation } from "../../translate";
import type { en } from "../en";

export const store = {
  title: "Tienda",
  intro: "Dónde responde tu tienda y cómo te pagan.",
  domainsHeading: "Dominios",
  domainsIntro: "Apunta el DNS del dominio a Monaztore y después agrégalo aquí.",
  noDomains: "Tu tienda todavía no tiene dominio: agrega uno para que te encuentren.",
  primary: "Principal",
  makePrimary: "Hacer principal",
  removeDomain: "Quitar {hostname}",
  domainLabel: "Dominio",
  addDomain: "Agregar dominio",
  domainAdded: "Dominio agregado.",
  domainTaken: "Otra tienda ya usa este dominio.",
  openStore: "Abrir la tienda",
  paymentsHeading: "Pagos",
  paymentsIntro: "Quien compra ve estos datos al hacer el pedido, para pagarte.",
  sinpeLabel: "Recibir SINPE Móvil",
  sinpePhone: "Teléfono de SINPE Móvil",
  holder: "A nombre de",
  transferLabel: "Recibir transferencias",
  bank: "Banco",
  iban: "IBAN",
  savePayments: "Guardar pagos",
  paymentsSaved: "Pagos guardados.",
  ownersOnly: "Solo la persona dueña del espacio cambia esto.",
} as const satisfies Translation<typeof en>["store"];
