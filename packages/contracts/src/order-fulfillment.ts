import { z } from "zod/mini";
import { message } from "./message";

/** "Mark as sent": the courier's tracking number, if there is one. */
export const orderShippedSchema = z.object({
  trackingNumber: z._default(
    z.string().check(z.trim(), z.maxLength(120, message("forms.textTooLong"))),
    "",
  ),
});
export type OrderShippedInput = z.infer<typeof orderShippedSchema>;

/**
 * A chat with the shopper on WhatsApp, how stores in Costa Rica talk to their buyers. A number of
 * 8 digits is a Costa Rican one (+506); a longer one already has its country code.
 */
export function whatsappLink(phone: string, countryCode = "506"): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return `https://wa.me/${digits.length === 8 ? countryCode + digits : digits}`;
}
