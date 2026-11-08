import type { Translation } from "../../translate";
import type { en } from "../en";

export const home = {
  title: "Monaztore",
  description: "Tu nuevo proyecto, listo para crecer.",
  heading: "Tu proyecto ya funciona",
  intro:
    "Entrar, idiomas, tema claro y oscuro, pruebas y despliegue vienen listos. Empieza por tu primera pantalla.",
  signIn: "Entrar",
  openApp: "Abrir la app",
} as const satisfies Translation<typeof en>["home"];
