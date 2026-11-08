import { z } from "zod/mini";
import { message } from "./message";

/** The biggest file a digital product takes: an e-book, a template pack, a short course. */
export const DIGITAL_FILE_MAX_BYTES = 50 * 1024 * 1024;
/** Files one digital product delivers. */
export const PRODUCT_FILES_MAX = 10;
/** What the download rules accept: enough for a real shop, never "forever" by a typo. */
export const DOWNLOAD_LIMIT_MAX = 100;
export const DOWNLOAD_DAYS_MAX = 3650;
/** What a new digital product starts with: 5 downloads per file, for 30 days after paying. */
export const DEFAULT_DOWNLOAD_LIMIT = 5;
export const DEFAULT_DOWNLOAD_DAYS = 30;

const THOUSANDS = /^\d{1,3}([.,\s]\d{3})+$/;
const DECIMAL = /^\d{1,10}([.,]\d{1,2})?$/;

/**
 * A price as people type it, in minor units: "5000", "5 000" and "5.000" are five thousand,
 * "12.50" and "12,50" twelve and a half. Null for anything else.
 */
export function priceToMinor(text: string): number | null {
  const clean = text.trim();
  if (THOUSANDS.test(clean)) return Number(clean.replace(/[.,\s]/g, "")) * 100;
  if (!DECIMAL.test(clean)) return null;
  return Math.round(Number(clean.replace(",", ".")) * 100);
}

/** 500050 → "5000.50", 500000 → "5000": how the form shows a saved price again. */
export function minorToPrice(minor: number): string {
  const whole = Math.trunc(minor / 100);
  const cents = Math.abs(minor % 100);
  return cents === 0 ? String(whole) : `${whole}.${String(cents).padStart(2, "0")}`;
}

const price = z.pipe(
  z.string({ error: message("forms.priceRequired") }).check(
    z.trim(),
    z.minLength(1, message("forms.priceRequired")),
    z.refine((value) => (priceToMinor(value) ?? 0) > 0, message("forms.priceInvalid")),
  ),
  z.transform((value) => priceToMinor(value) as number),
);

/** An optional whole number between 1 and `max`; empty means "no limit". */
const optionalCount = (max: number, invalid: Parameters<typeof message>[0]) =>
  z.pipe(
    z._default(
      z.string().check(
        z.trim(),
        z.refine((value) => {
          if (value === "") return true;
          if (!/^\d{1,4}$/.test(value)) return false;
          const number = Number(value);
          return number >= 1 && number <= max;
        }, message(invalid)),
      ),
      "",
    ),
    z.transform((value) => (value === "" ? null : Number(value))),
  );

const downloadRules = {
  downloadLimit: optionalCount(DOWNLOAD_LIMIT_MAX, "forms.downloadLimitInvalid"),
  downloadDays: optionalCount(DOWNLOAD_DAYS_MAX, "forms.downloadDaysInvalid"),
};

/** How many times and for how long each file can be downloaded. Empty = no limit. */
export const downloadRulesSchema = z.object(downloadRules);
export type DownloadRulesInput = z.infer<typeof downloadRulesSchema>;

const file = z
  .file({ error: message("forms.digitalFileRequired") })
  .check(
    z.minSize(1, message("forms.digitalFileRequired")),
    z.maxSize(DIGITAL_FILE_MAX_BYTES, message("forms.digitalFileTooBig")),
  );

/** "New digital product": what it's called, its price, a few words and the file it delivers. */
export const newDigitalProductSchema = z.object({
  name: z
    .string({ error: message("forms.productNameRequired") })
    .check(
      z.trim(),
      z.minLength(1, message("forms.productNameRequired")),
      z.maxLength(120, message("forms.textTooLong")),
    ),
  price,
  description: z._default(
    z.string().check(z.trim(), z.maxLength(2000, message("forms.textTooLong"))),
    "",
  ),
  file,
  ...downloadRules,
});
export type NewDigitalProductInput = z.infer<typeof newDigitalProductSchema>;

/** One more file for a product. */
export const productFileSchema = z.object({ file });

/** A file's size as people read it: "820 KB", "12.4 MB". */
export function formatFileSize(bytes: number, locale: string): string {
  const units = ["byte", "kilobyte", "megabyte", "gigabyte"] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: units[unit],
    unitDisplay: "short",
    maximumFractionDigits: unit < 2 ? 0 : 1,
  }).format(value);
}

/**
 * The name the shopper's browser saves the file with: the name it was uploaded with, without
 * folders or characters a disk refuses, at most 120 characters.
 */
export function downloadFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it removes
  const clean = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").trim();
  if (!clean || /^\.+$/.test(clean)) return "download";
  if (clean.length <= 120) return clean;
  const dot = clean.lastIndexOf(".");
  const extension = dot > 0 && clean.length - dot <= 10 ? clean.slice(dot) : "";
  return clean.slice(0, 120 - extension.length) + extension;
}
