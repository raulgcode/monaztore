import type { Translation } from "../../translate";
import type { en } from "../en";

/** What every page uses: the header, the menus, the error page. The root route loads it. */
export const common = {
  appName: "Monaztore",
  skipToContent: "Saltar al contenido",
  loading: "Cargando…",
  signOut: "Cerrar sesión",
  themeSystem: "Sistema",
  themeLight: "Claro",
  themeDark: "Oscuro",
  themeSwitch: "Tema: {theme}. Cambiar a {next}",
  themeCurrent: "Tema: {theme}",
  languageLegend: "Idioma",
  languageIntro: "Elige en qué idioma ves la app. Se guarda en este dispositivo y en tu cuenta.",
  languageSave: "Guardar idioma",
  errorTitle: "Ups, algo salió mal",
  errorDetails: "No fue tu culpa. Vuelve a intentarlo en un momento.",
  errorStatus: "Error {status}",
  errorRetry: "Intentar de nuevo",
  errorHome: "Ir al inicio",
  notFoundTitle: "No encontramos esta página",
  notFoundDetails: "Puede que el enlace esté incompleto o que la página ya no exista.",
  supportBanner: "Soporte: estás dentro de la cuenta de <strong>{email}</strong>",
  supportBannerReadOnly: "Soporte, solo mirando: <strong>{email}</strong>",
  supportLeave: "Volver al admin",
} as const satisfies Translation<typeof en>["common"];
