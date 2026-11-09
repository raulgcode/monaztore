import type { Translation } from "../../translate";
import type { en } from "../en";

export const ai = {
  title: "Asistentes de IA",
  intro:
    "Conecta Claude, ChatGPT u otro asistente para que lleve tu tienda contigo: productos, pedidos, cupones, páginas y el diseño.",
  addressTitle: "Conectar un asistente",
  addressHelp:
    "En tu asistente, agrega un conector personalizado (MCP) con esta dirección. Te traerá aquí para que entres y le des permiso.",
  address: "Dirección para conectar",
  copy: "Copiar",
  copied: "Copiada",
  connected: "Asistentes conectados",
  none: "Todavía no hay ningún asistente conectado.",
  connectedOn: "Conectado el {date}",
  lastUsed: "Usado por última vez el {date}",
  unknownClient: "Un asistente",
  remove: "Desconectar",
  removeLabel: "Desconectar {name}",
  removed: "Desconectaste {name}: ya no puede entrar a tus tiendas.",
  support: "Los asistentes son de la persona: soporte no puede conectarlos ni desconectarlos.",
  consentTitle: "{client} quiere trabajar en tus tiendas",
  consentIntro: "Si le das permiso, puede hacer lo mismo que tú en cada tienda, con tu rol:",
  consentCatalog: "Ver y cambiar productos, categorías, cupones, páginas y el diseño",
  consentOrders: "Ver pedidos, confirmar pagos y cancelar los que no se han pagado",
  consentAsks:
    "Te pregunta antes de cada cambio. Las fotos, los archivos y las credenciales de Hacienda se quedan en el panel.",
  consentStores: "Tus tiendas",
  consentNoStores: "Todavía no estás en el equipo de ninguna tienda.",
  consentSignedInAs: "Entraste como {email}.",
  consentRemoveLater: "Puedes desconectarlo cuando quieras en Ajustes → Asistentes de IA.",
  consentExpired: "Esta solicitud venció. Vuelve a tu asistente y conéctalo otra vez.",
  allow: "Dar permiso",
  allowing: "Dando permiso…",
  deny: "No dar permiso",
} as const satisfies Translation<typeof en>["ai"];
