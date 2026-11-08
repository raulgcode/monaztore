import type { Translation } from "../../translate";
import type { en } from "../en";

export const security = {
  mfaTitle: "Segundo paso",
  mfaSetupHeading: "Protege tu cuenta con tu celular",
  mfaSetupIntro:
    "Escanea este código con una app de autenticación (Google Authenticator, 1Password, Authy) y escribe los 6 números que muestra.",
  mfaQrAlt: "Código QR para tu app de autenticación",
  mfaSecretLabel: "¿No puedes escanearlo? Escribe esta clave en la app:",
  mfaCodeLabel: "Código de la app",
  mfaConfirm: "Activar",
  mfaVerifyHeading: "Escribe tu código",
  mfaVerifyIntro:
    "Abre tu app de autenticación y escribe los 6 números que muestra ahora. También sirve un código de respaldo.",
  mfaVerify: "Continuar",
  mfaRecoveryHeading: "Guarda tus códigos de respaldo",
  mfaRecoveryIntro:
    "Si pierdes el celular, cada uno de estos códigos te deja entrar una vez. Guárdalos en un lugar seguro, lejos del celular: no los vas a volver a ver.",
  mfaRecoveryLabel: "Códigos de respaldo",
  mfaContinue: "Ya los guardé, continuar",
  mfaPasskeyHeading: "Confirma que eres tú",
  mfaPasskeyIntro: "Usa tu huella, tu cara o tu llave de seguridad, o escribe el código de tu app.",
  mfaPasskeyButton: "Usar huella o llave",
  mfaPasskeyWaiting: "Esperando tu huella o llave…",
  mfaPasskeyOr: "o escribe el código",
  mfaPasskeyFailed: "No pudimos confirmar tu huella o llave. Prueba de nuevo o escribe el código.",
  mfaPasskeyUnsupported: "Este navegador no puede usar huellas ni llaves. Escribe el código.",
  mfaPasskeyTip:
    "¿Quieres entrar más rápido? Ya adentro, agrega tu huella o una llave en Seguridad.",
  passkeysTitle: "Seguridad",
  passkeysIntro:
    "Tu huella, tu cara, tu celular o una llave de seguridad te dejan saltar el código al entrar.",
  passkeyAddHeading: "Agregar en este dispositivo",
  passkeyAddIntro: "Tu dispositivo pide tu huella, tu cara o tu llave y la guarda ahí.",
  passkeyName: "Nombre",
  passkeyNameHint: "Para reconocerla en la lista, por ejemplo “iPhone de Ana”.",
  passkeyDefaultName: "Este dispositivo",
  passkeyAdd: "Agregar huella o llave",
  passkeyAdding: "Esperando tu huella o llave…",
  passkeyAdded: "Listo: la próxima vez, entra con “{name}”.",
  passkeyFailed: "No se agregó. Si la cancelaste, prueba de nuevo.",
  passkeyAlreadyHere: "Este dispositivo ya está en la lista.",
  passkeyUnsupported:
    "Este navegador no puede usar huellas ni llaves. Prueba con Safari, Chrome o Edge.",
  passkeysLimit: "Ya tienes {max}. Quita una para agregar otra.",
  passkeysListHeading: "Tus huellas y llaves",
  passkeysEmpty: "Todavía no agregaste ninguna. Mientras tanto, entras con el código.",
  passkeyCreated: "Agregada el {date}",
  passkeyLastUsed: "Usada por última vez el {date}",
  passkeyNeverUsed: "Sin usar todavía",
  passkeyRemove: "Quitar",
  passkeyRemoveLabel: "Quitar {name}",
} as const satisfies Translation<typeof en>["security"];
