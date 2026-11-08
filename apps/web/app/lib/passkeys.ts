// What the passkey pages read from the request. Pure, so the browser bundle can use it.

const devices: [RegExp, string][] = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/CrOS/, "Chromebook"],
  [/Macintosh|Mac OS X/, "Mac"],
  [/Windows/, "Windows"],
  [/Linux/, "Linux"],
];

/**
 * A name that already works for the passkey of this device ("iPhone", "Mac"); null when the
 * browser doesn't say, and the page offers "This device".
 */
export function deviceNameOf(userAgent: string): string | null {
  return devices.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
}

/**
 * The browser's response, as the form posts it: JSON with at least the credential id. Its
 * signature is checked in `core`; this only turns junk into null.
 */
export function passkeyResponseOf<T extends { id: string }>(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && typeof (parsed as T).id === "string"
      ? (parsed as T)
      : null;
  } catch {
    return null;
  }
}
