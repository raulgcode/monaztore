import type { Key } from "@monaztore/i18n/messages";

/**
 * A validation error is a translation key, not a text: the same schema runs in the browser and
 * in the action, and `FieldErrors` shows the key in the page's language. Types only, so no
 * dictionary reaches the bundle.
 */
export const message = (key: Key) => key;
