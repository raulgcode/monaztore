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
  orderPlacedSubject: "{store}: recibimos tu pedido #{number}",
  orderPlacedHeading: "Gracias, {name}",
  orderPlacedBody: "{store} recibió tu pedido #{number}. Esto es lo que pediste:",
  orderDiscount: "Descuento ({code})",
  orderShipping: "Envío: {name}",
  orderShippingFree: "Gratis",
  orderTotal: "Total: {total}",
  orderPayHow:
    "Para confirmarlo, paga {total} y manda el comprobante desde la página de tu pedido. La tienda lo prepara cuando llega el pago.",
  orderPaySinpe: "SINPE Móvil al {phone}, a nombre de {holder}.",
  orderPayTransfer: "Transferencia a {bank}, IBAN {iban}, a nombre de {holder}.",
  orderPlacedButton: "Ver mi pedido",
  orderPlacedNote:
    "Guarda este correo: el botón abre tu pedido, con su estado, cuando quieras. Escribe el número de pedido #{number} en la descripción del pago.",
  storeOrderSubject: "{store}: pedido nuevo #{number}",
  storeOrderBody: "{name} ({email}) hizo un pedido de {total}:",
  storeOrderButton: "Abrir el pedido",
  storeOrderNote:
    "Espera el pago: cuando la persona mande el comprobante, te llega otro correo para confirmarlo.",
  storeReferenceSubject: "{store}: el pedido #{number} dice que ya pagó",
  storeReferenceBody: "{name} mandó el pago de {total} con el comprobante {reference}.",
  storeReferenceNote:
    "Revisa que el dinero llegó a tu cuenta y marca el pedido como pagado: solo entonces queda listo para preparar.",
} as const satisfies Translation<typeof en>["email"];
