import type { Translation } from "../../translate";
import type { en } from "../en";

/** /app: the onboarding, the workspace's layout and its home. */
export const workspace = {
  onboardingTitle: "Crea tu espacio",
  onboardingHeading: "Crea tu espacio de trabajo",
  onboardingIntro: "Es donde vive todo lo de tu equipo. Puedes cambiarle el nombre después.",
  nameLabel: "Nombre del espacio",
  namePlaceholder: "Mi empresa",
  create: "Continuar",
  creating: "Creando…",
  navHome: "Inicio",
  navSettings: "Ajustes",
  navLabel: "Menú principal",
  homeTitle: "Inicio",
  homeHeading: "Hola, {name}",
  homeIntro: "Este es el inicio de {workspace}. Aquí va la primera pantalla de tu proyecto.",
} as const satisfies Translation<typeof en>["workspace"];
