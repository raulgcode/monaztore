import type { Translation } from "../../translate";
import type { en } from "../en";

export const settings = {
  title: "Ajustes",
  intro: "Cómo se ve la app y en qué idioma.",
  appearance: "Apariencia",
  appearanceIntro: "Claro, oscuro o como tu dispositivo.",
  account: "Tu cuenta",
  signedInAs: "Entraste como <email>{email}</email>.",
  security: "Entrar seguro",
  securityIntro:
    "El segundo paso que protege tu tienda: tu app de autenticación y tus huellas o llaves.",
  securityOpen: "Huellas y llaves",
} as const satisfies Translation<typeof en>["settings"];
