import type { Translation } from "../../translate";
import type { en } from "../en";

export const inquiries = {
  title: "Solicitudes",
  intro: "Lo que te piden desde los formularios de tus páginas. Respóndeles por WhatsApp o correo.",
  tabNew: "Por responder",
  tabDone: "Respondidas",
  tabAll: "Todas",
  tabsLabel: "Qué solicitudes",
  empty:
    "Aún no hay solicitudes aquí. Agrega un formulario de pedido a una página y llegarán aquí.",
  emptyDone: "Todavía no marcas ninguna como respondida.",
  from: "Desde {page}",
  whatsapp: "WhatsApp",
  email: "Correo",
  replySubject: "Tu solicitud en {store}",
  markDone: "Marcar como respondida",
  markNew: "Volver a “Por responder”",
  remove: "Borrar",
  removeConfirm: "¿Borrar la solicitud de {name}? No se puede deshacer.",
  removed: "Solicitud borrada.",
  previous: "Anterior",
  next: "Siguiente",
  pageOf: "Página {page} de {pages}",
  homeCard: { one: "{count} solicitud por responder", other: "{count} solicitudes por responder" },
  storeLink: "Solicitudes de tus páginas",
  storeLinkHint: "Lo que te mandan desde el formulario de una página",
} as const satisfies Translation<typeof en>["inquiries"];
