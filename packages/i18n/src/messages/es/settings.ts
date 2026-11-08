import type { Translation } from "../../translate";
import type { en } from "../en";

export const settings = {
  title: "Ajustes",
  intro: "Cómo se ve la app y en qué idioma.",
  appearance: "Apariencia",
  appearanceIntro: "Claro, oscuro o como tu dispositivo.",
  account: "Tu cuenta",
  signedInAs: "Entraste como <email>{email}</email>.",
} as const satisfies Translation<typeof en>["settings"];
