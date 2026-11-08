import { z } from "zod/mini";
import { message } from "./message";

const optionalText = (max: number) =>
  z._default(z.string().check(z.trim(), z.maxLength(max, message("forms.textTooLong"))), "");

const checkbox = z._default(
  z.pipe(
    z.optional(z.string()),
    z.transform((value) => value === "on"),
  ),
  false,
);

/**
 * How the store gets paid. A method that is on needs what the shopper will see: the phone for
 * SINPE Móvil, the IBAN for a transfer, and whose name they are in.
 */
export const paymentSettingsSchema = z
  .object({
    sinpeEnabled: checkbox,
    sinpePhone: optionalText(20),
    sinpeHolder: optionalText(80),
    transferEnabled: checkbox,
    transferBank: optionalText(80),
    transferIban: optionalText(34),
    transferHolder: optionalText(80),
  })
  .check(
    z.superRefine((value, ctx) => {
      const need = (ok: boolean, path: string, key: Parameters<typeof message>[0]) => {
        if (!ok) ctx.addIssue({ code: "custom", path: [path], message: message(key) });
      };
      if (value.sinpeEnabled) {
        need(/^\+?[\d\s-]{8,20}$/.test(value.sinpePhone), "sinpePhone", "forms.phoneInvalid");
        need(value.sinpeHolder.length > 0, "sinpeHolder", "forms.holderRequired");
      }
      if (value.transferEnabled) {
        need(value.transferBank.length > 0, "transferBank", "forms.bankRequired");
        need(
          /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(
            value.transferIban.replace(/\s/g, "").toUpperCase(),
          ),
          "transferIban",
          "forms.ibanInvalid",
        );
        need(value.transferHolder.length > 0, "transferHolder", "forms.holderRequired");
      }
    }),
  );
export type PaymentSettingsInput = z.infer<typeof paymentSettingsSchema>;

/** The form's values as `store_settings.payments`. */
export function paymentsFromForm(input: PaymentSettingsInput) {
  return {
    sinpe: { enabled: input.sinpeEnabled, phone: input.sinpePhone, holder: input.sinpeHolder },
    transfer: {
      enabled: input.transferEnabled,
      bank: input.transferBank,
      iban: input.transferIban.replace(/\s/g, "").toUpperCase(),
      holder: input.transferHolder,
    },
  };
}

/** A domain to connect: `mitienda.com`, without https:// or a path. */
export const domainSchema = z.object({
  hostname: z
    .string({ error: message("forms.domainRequired") })
    .check(
      z.trim(),
      z.toLowerCase(),
      z.regex(/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/, message("forms.domainInvalid")),
      z.maxLength(253, message("forms.domainInvalid")),
    ),
});
