import type { Translation } from "../../translate";
import type { en } from "../en";

/** /app: the onboarding, the workspace's layout and its home. */
export const workspace = {
  onboardingTitle: "Crea tu espacio",
  onboardingHeading: "Crea tu espacio de trabajo",
  onboardingIntro: "Es donde vive todo lo de tu equipo. Puedes cambiarle el nombre después.",
  onboardingClosed:
    "Esta tienda ya tiene su espacio. Pídele a quien la administra que te invite con este correo.",
  nameLabel: "Nombre del espacio",
  namePlaceholder: "Mi empresa",
  create: "Continuar",
  creating: "Creando…",
  navHome: "Inicio",
  navOrders: "Pedidos",
  navProducts: "Productos",
  navDesign: "Diseño",
  navStore: "Tienda",
  navPages: "Páginas",
  navSettings: "Ajustes",
  navLabel: "Menú principal",
  homeTitle: "Inicio",
  homeHeading: "Hola, {name}",
  homeIntro: "Este es el inicio de {workspace}. Aquí va la primera pantalla de tu proyecto.",
  supportVisit: "Nuestro equipo de soporte entró a tu tienda el {date} para ayudarte.",
  supportVisitReadOnly: "Nuestro equipo de soporte miró tu tienda el {date}, sin cambiar nada.",
} as const satisfies Translation<typeof en>["workspace"];
