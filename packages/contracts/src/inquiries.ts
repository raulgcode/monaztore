import { z } from "zod/mini";
import { message } from "./message";

// A request a shopper sends from a page's form block ("I want socks with my dog"): it reaches the
// store's Requests in the workspace and the owners' email.

const required = (key: Parameters<typeof message>[0], max: number) =>
  z
    .string({ error: message(key) })
    .check(z.trim(), z.minLength(1, message(key)), z.maxLength(max, message("forms.textTooLong")));

/** Most links a request may carry: spam is mostly links. */
export const INQUIRY_LINKS_MAX = 2;

/** `http://`, `https://` and `www.` addresses in a text. */
export function linkCount(value: string): number {
  return value.match(/(https?:\/\/|www\.)/gi)?.length ?? 0;
}

/** What the form sends. The bot checks (honeypot, timing, captcha) go apart, in the web. */
export const inquirySchema = z.object({
  blockId: z.string().check(z.minLength(1), z.maxLength(40)),
  name: required("forms.nameRequired", 80),
  email: z
    .string({ error: message("forms.emailInvalid") })
    .check(
      z.trim(),
      z.toLowerCase(),
      z.maxLength(254, message("forms.emailInvalid")),
      z.email(message("forms.emailInvalid")),
    ),
  phone: z._default(
    z.string().check(
      z.trim(),
      z.refine(
        (value) => value === "" || /^\+?[\d\s()-]{7,20}$/.test(value),
        message("forms.phoneInvalid"),
      ),
    ),
    "",
  ),
  message: z.string({ error: message("forms.inquiryMessageRequired") }).check(
    z.trim(),
    z.minLength(1, message("forms.inquiryMessageRequired")),
    z.maxLength(2000, message("forms.textTooLong")),
    z.refine((value) => linkCount(value) <= INQUIRY_LINKS_MAX, message("forms.tooManyLinks")),
  ),
});
export type InquiryInput = z.infer<typeof inquirySchema>;

export const inquiryStatuses = ["new", "done"] as const;
export type InquiryStatus = (typeof inquiryStatuses)[number];

/** `?status=` of the workspace's Requests: new ones first, "done" or all. */
export function readInquiryStatus(value: string | null): InquiryStatus | "all" {
  return value === "done" || value === "all" ? value : "new";
}
