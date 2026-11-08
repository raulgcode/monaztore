import type { Translation } from "../../translate";
import type { en } from "../en";

/** The emails (`@monaztore/email`): each one goes in the recipient's language. */
export const email = {
  footer: "Recibiste este correo porque alguien lo pidió con esta dirección en Monaztore.",
  linkFallback: "¿No funciona el botón? Copia este enlace en tu navegador:",
  magicSubject: "Tu enlace para entrar",
  magicHeading: "Entra con un toque",
  magicBody: "Toca el botón para entrar. El enlace sirve 5 minutos y una sola vez.",
  magicButton: "Entrar",
  magicIgnore: "Si no lo pediste, ignora este correo: nadie entra sin abrir el enlace.",
  verifySubject: "Confirma tu correo",
  verifyHeading: "Hola, {name}",
  verifyBody: "Confirma tu correo para terminar de crear tu cuenta.",
  verifyButton: "Confirmar correo",
  verifyIgnore: "Si no creaste una cuenta, ignora este correo.",
  resetSubject: "Elige una nueva contraseña",
  resetHeading: "Hola, {name}",
  resetBody: "Toca el botón para elegir una nueva contraseña. El enlace sirve una hora.",
  resetButton: "Elegir contraseña",
  resetIgnore: "Si no lo pediste, ignora este correo: tu contraseña no cambia.",
  einvoiceSubject: "{store}: tu factura electrónica del pedido #{number}",
  eticketSubject: "{store}: tu tiquete electrónico del pedido #{number}",
  einvoiceBody: "Hacienda aceptó el comprobante que {store} emitió por tu compra.",
  einvoiceNumber: "Número: {consecutive}",
  einvoiceClave: "Clave: {clave}",
  einvoiceFiles:
    "Van adjuntos el XML firmado y la respuesta de Hacienda. Guárdalos para tus registros.",
  downloadsSubject: "{store}: tus descargas del pedido #{number}",
  downloadsHeading: "Hola, {name}: tus archivos están listos",
  downloadsBody: "{store} confirmó tu pago. Descarga lo que compraste desde esta página:",
  downloadsButton: "Descargar mis archivos",
  downloadsNote:
    "El enlace es solo para ti: cada archivo se descarga un número limitado de veces y durante unos días. La página de tu pedido también los tiene.",
} as const satisfies Translation<typeof en>["email"];
