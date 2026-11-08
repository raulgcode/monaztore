import { z } from "zod/mini";
import { message } from "./message";

// The platform's own panel (/admin) and the second sign-in step everyone with a panel passes.

/** Today's code from the authenticator app (6 digits) or a recovery code (`a1b2c-3d4e5`). */
export const mfaCodeSchema = z.object({
  code: z
    .string({ error: message("forms.mfaCodeRequired") })
    .check(
      z.trim(),
      z.minLength(6, message("forms.mfaCodeRequired")),
      z.maxLength(20, message("forms.mfaCodeInvalid")),
    ),
});
export type MfaCodeInput = z.infer<typeof mfaCodeSchema>;

/** The name of a passkey ("iPhone", "YubiKey"), to tell them apart later. */
export const passkeyNameSchema = z.object({
  name: z
    .string({ error: message("forms.passkeyNameRequired") })
    .check(
      z.trim(),
      z.minLength(1, message("forms.passkeyNameRequired")),
      z.maxLength(60, message("forms.passkeyNameTooLong")),
    ),
});
export type PasskeyNameInput = z.infer<typeof passkeyNameSchema>;

/** No commission goes above this: a typo like "25" for "2.5" is caught before it charges. */
export const COMMISSION_MAX_BPS = 2000;

const PERCENT = /^\d{1,2}([.,]\d{1,2})?$/;

/** "2.5" or "2,5" → 250 basis points; null for anything else. */
export function percentToBps(text: string): number | null {
  const clean = text.trim();
  if (!PERCENT.test(clean)) return null;
  return Math.round(Number(clean.replace(",", ".")) * 100);
}

/** 250 → "2.5", the way the form shows it again. */
export function bpsToPercent(bps: number): string {
  return String(bps / 100);
}

const percent = z.string({ error: message("forms.commissionRequired") }).check(
  z.trim(),
  z.refine((value) => percentToBps(value) !== null, message("forms.commissionInvalid")),
  z.refine(
    (value) => (percentToBps(value) ?? 0) <= COMMISSION_MAX_BPS,
    message("forms.commissionTooHigh"),
  ),
);

/** The commission every store pays on card sales, unless it has its own. */
export const defaultCommissionSchema = z.object({ percent });
export type DefaultCommissionInput = z.infer<typeof defaultCommissionSchema>;

/** One store's own commission; empty follows the platform's. */
export const storeCommissionSchema = z.object({
  percent: z.optional(percent),
  note: z.optional(z.string().check(z.trim(), z.maxLength(280, message("forms.noteTooLong")))),
});
export type StoreCommissionInput = z.infer<typeof storeCommissionSchema>;

export const ADMIN_STORES_PAGE_SIZE = 25;

/** The store list's state, from the URL: `?q=&page=`. */
export function readAdminStoreQuery(params: URLSearchParams): { q: string; page: number } {
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const page = Number.parseInt(params.get("page") ?? "1", 10);
  return { q, page: Number.isFinite(page) && page > 0 ? Math.min(page, 10_000) : 1 };
}
