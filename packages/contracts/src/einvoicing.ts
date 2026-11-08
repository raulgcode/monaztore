import { z } from "zod/mini";
import { checkoutSchema, digitalCheckoutSchema } from "./checkout";
import { message } from "./message";

/**
 * Electronic invoicing with Costa Rica's Hacienda. Only stores in Costa Rica see it. The owner
 * fills three short forms (who issues, what they sell, their Hacienda key) and turns it on.
 */

/** Hacienda's ID types: 01 physical person, 02 company, 03 DIMEX, 04 NITE. */
export type TaxIdType = "01" | "02" | "03" | "04";

/** Only digits (and letters, for the new company IDs): "1-1234-0567" → "112340567". */
export function cleanTaxId(value: string): string {
  return value.replace(/[\s.-]/g, "").toUpperCase();
}

/**
 * The type from the ID itself, so nobody has to know the codes: 9 digits is a person's cédula,
 * 10 starting with 3 a company, 11–12 a DIMEX, other 10-digit ones a NITE.
 */
export function taxIdTypeOf(raw: string): TaxIdType | undefined {
  const id = cleanTaxId(raw);
  if (/^[1-9]\d{8}$/.test(id)) return "01";
  if (/^3[0-9A-Z]{9}$/.test(id)) return "02";
  if (/^[1-9]\d{10,11}$/.test(id)) return "03";
  if (/^\d{10}$/.test(id)) return "04";
  return undefined;
}

const taxId = z
  .pipe(
    z
      .string({ error: message("forms.taxIdRequired") })
      .check(z.trim(), z.minLength(1, message("forms.taxIdRequired"))),
    z.transform(cleanTaxId),
  )
  .check(
    z.refine((value) => taxIdTypeOf(value) !== undefined, { error: message("forms.taxIdInvalid") }),
  );

const required = (key: Parameters<typeof message>[0], max: number) =>
  z
    .string({ error: message(key) })
    .check(z.trim(), z.minLength(1, message(key)), z.maxLength(max, message("forms.textTooLong")));

const optionalText = (max: number) =>
  z._default(z.string().check(z.trim(), z.maxLength(max, message("forms.textTooLong"))), "");

/** Step 1: who issues the documents, as Hacienda has them. */
export const einvoicingIssuerSchema = z.object({
  idNumber: taxId,
  name: required("forms.taxNameRequired", 100),
  commercialName: optionalText(80),
  email: z.pipe(
    z.string({ error: message("forms.emailRequired") }).check(z.trim(), z.toLowerCase()),
    z.email({ error: message("forms.emailInvalid") }),
  ),
  phone: z._default(
    z.string().check(
      z.trim(),
      z.refine((value) => value === "" || /^(\+?506)?[\s-]?\d{4}[\s-]?\d{4}$/.test(value), {
        error: message("forms.phoneInvalid"),
      }),
    ),
    "",
  ),
  activityCode: z
    .string({ error: message("forms.activityRequired") })
    .check(z.trim(), z.regex(/^\d{6}$/, message("forms.activityInvalid"))),
  /** `1-02-03`: province, canton and district. */
  district: z
    .string({ error: message("forms.districtRequired") })
    .check(z.regex(/^[1-7]-\d{2}-\d{2}$/, message("forms.districtRequired"))),
  address: z
    .string({ error: message("forms.addressRequired") })
    .check(
      z.trim(),
      z.minLength(5, message("forms.addressRequired")),
      z.maxLength(250, message("forms.textTooLong")),
    ),
});
export type EinvoicingIssuerInput = z.infer<typeof einvoicingIssuerSchema>;

/** Step 2: the CABYS code of what the store sells, from Hacienda's catalog. */
export const einvoicingProductSchema = z.object({
  cabys: z
    .string({ error: message("forms.cabysRequired") })
    .check(z.trim(), z.regex(/^\d{13}$/, message("forms.cabysInvalid"))),
  cabysDescription: optionalText(500),
});
export type EinvoicingProductInput = z.infer<typeof einvoicingProductSchema>;

/** Searching the CABYS catalog by words: "camiseta", "zapatos". */
export const cabysSearchSchema = z.object({
  q: required("forms.cabysSearchRequired", 80),
});

/** Sandbox users end in `@stag.comprobanteselectronicos.go.cr`, real ones in `@prod.…`. */
export function haciendaEnvironmentOf(username: string): "sandbox" | "production" {
  return /@stag\./i.test(username) ? "sandbox" : "production";
}

/**
 * Step 3: the "Llave criptográfica" from ATV (.p12 and its PIN) and the API user and password.
 * A secret already saved can be left empty to keep it; the action says which ones it needs.
 */
export const einvoicingCredentialsSchema = z.object({
  haciendaUsername: z
    .string({ error: message("forms.haciendaUserRequired") })
    .check(
      z.trim(),
      z.toLowerCase(),
      z.regex(
        /^cp[a-z]-[\w-]+@(stag|prod)\.comprobanteselectronicos\.go\.cr$/,
        message("forms.haciendaUserInvalid"),
      ),
    ),
  haciendaPassword: z._default(z.string().check(z.maxLength(200)), ""),
  certificate: z.optional(z.file()),
  certificatePin: z._default(
    z.string().check(z.trim(), z.regex(/^\d{0,4}$/, message("forms.pinInvalid"))),
    "",
  ),
});
export type EinvoicingCredentialsInput = z.infer<typeof einvoicingCredentialsSchema>;

/** A number typed in a field: digits only, no leading zero, within the pattern's length. */
function wholeNumber(pattern: RegExp) {
  return z.pipe(
    z.string().check(z.trim(), z.regex(pattern, message("forms.numberInvalid"))),
    z.transform(Number),
  );
}

/** Where documents are numbered from, for a store that already issues with another system. */
export const einvoicingOptionsSchema = z.object({
  autoIssue: z._default(
    z.pipe(
      z.optional(z.string()),
      z.transform((value) => value === "on"),
    ),
    false,
  ),
  branch: wholeNumber(/^[1-9]\d{0,2}$/),
  terminal: wholeNumber(/^[1-9]\d{0,4}$/),
});
export type EinvoicingOptionsInput = z.infer<typeof einvoicingOptionsSchema>;

const invoiceToFields = {
  taxIdNumber: z._default(z.pipe(z.string().check(z.trim()), z.transform(cleanTaxId)), ""),
  taxName: optionalText(100),
};

/** Both empty is a ticket; one without the other, or an ID that isn't one, is an error. */
const invoiceToCheck = z.superRefine((value: { taxIdNumber: string; taxName: string }, ctx) => {
  if (value.taxIdNumber === "" && value.taxName === "") return;
  if (taxIdTypeOf(value.taxIdNumber) === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["taxIdNumber"],
      message: message(value.taxIdNumber ? "forms.taxIdInvalid" : "forms.taxIdRequired"),
    });
  }
  if (value.taxName.length < 3) {
    ctx.addIssue({ code: "custom", path: ["taxName"], message: message("forms.taxNameRequired") });
  }
});

/** "Invoice in my name" on the order's page: the ID and the name on it, or nothing. */
export const invoiceToSchema = z.object(invoiceToFields).check(invoiceToCheck);
export type InvoiceToInput = z.infer<typeof invoiceToSchema>;

/** The checkout of a store that issues invoices: the usual form plus "invoice in my name". */
export const checkoutWithInvoiceSchema = z
  .extend(checkoutSchema, invoiceToFields)
  .check(invoiceToCheck);

/** The same for a cart with only digital downloads (no address). */
export const digitalCheckoutWithInvoiceSchema = z
  .extend(digitalCheckoutSchema, invoiceToFields)
  .check(invoiceToCheck);

/** The form's values as the order's `taxId`, or null for a ticket. */
export function taxIdFromForm(input: InvoiceToInput) {
  const idType = taxIdTypeOf(input.taxIdNumber);
  if (!idType || !input.taxName) return null;
  return { idType, idNumber: input.taxIdNumber, name: input.taxName };
}
