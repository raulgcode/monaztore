import type { Translation } from "../../translate";
import type { en } from "../en";

/**
 * Shared by the forms, including the validation errors: the schemas in `@monaztore/contracts`
 * return these keys and `FieldErrors` translates them.
 */
export const forms = {
  emailLabel: "Correo electrónico",
  emailPlaceholder: "tu@correo.com",
  continueWithGoogle: "Continuar con Google",
  orWithEmail: "o con tu correo",
  emailRequired: "Escribe tu correo",
  emailInvalid: "Escribe un correo válido",
  passwordRequired: "Escribe tu contraseña",
  passwordTooShort: "Usa al menos 8 caracteres",
  passwordTooLong: "Usa hasta 128 caracteres",
  nameRequired: "Escribe tu nombre",
  nameTooLong: "Tu nombre puede tener hasta 80 caracteres",
  workspaceNameRequired: "Escribe el nombre de tu espacio",
  workspaceNameTooShort: "El nombre debe tener al menos 2 caracteres",
  workspaceNameTooLong: "El nombre puede tener hasta 80 caracteres",
  tooManyAttempts: "Demasiados intentos. Espera unos minutos y vuelve a probar.",
  phoneRequired: "Escribe un teléfono donde podamos contactarte",
  phoneInvalid: "Escribe un teléfono válido",
  addressRequired: "Escribe la dirección",
  cityRequired: "Escribe la ciudad o el pueblo",
  provinceRequired: "Escribe la provincia",
  textTooLong: "Es demasiado largo",
  paymentMethodRequired: "Elige cómo vas a pagar",
  referenceRequired: "Escribe el número de referencia del pago",
  holderRequired: "Escribe a nombre de quién está la cuenta",
  bankRequired: "Escribe el banco",
  ibanInvalid: "Escribe un IBAN válido, como CR05015202001026284066",
  domainRequired: "Escribe el dominio",
  domainInvalid: "Escribe solo el dominio, como mitienda.com",
} as const satisfies Translation<typeof en>["forms"];
