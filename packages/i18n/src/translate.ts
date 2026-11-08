import type { Locale } from "./locale";

/**
 * A text with a count picks its form with `Intl.PluralRules`: `one` and `other` are required,
 * the rest are optional and fall back to `other` (Spanish says "many" for 1 000 000).
 */
export interface PluralMessage {
  readonly zero?: string;
  readonly one: string;
  readonly two?: string;
  readonly few?: string;
  readonly many?: string;
  readonly other: string;
}

export type Message = string | PluralMessage;

/** One screen or area of the app: `{ empty: "No customers yet", … }`. */
export type Namespace = { readonly [key: string]: Message };

/** Every namespace of a language: `{ common: {…}, customers: {…} }`. */
export type Dictionary = { readonly [namespace: string]: Namespace };

/**
 * The shape another language must have: the same namespaces and keys as the English source,
 * with any text. `es satisfies Translation<typeof en>` breaks typecheck when a key is missing.
 */
export type Translation<D extends Dictionary> = {
  readonly [N in keyof D]: {
    readonly [K in keyof D[N]]: D[N][K] extends string ? string : PluralMessage;
  };
};

/**
 * A regional variant: some texts of some namespaces, in the source's shape. `en-GB` would only hold
 * what changes from `en`; `withOverrides` fills in the rest.
 */
export type Overrides<D extends Dictionary> = {
  readonly [N in keyof D]?: Partial<Translation<D>[N]>;
};

/** The variant's texts over the source's: a full dictionary of the variant. */
export function withOverrides<D extends Dictionary>(
  source: Translation<D>,
  overrides: Overrides<D>,
): Translation<D> {
  return Object.fromEntries(
    Object.entries(source).map(([namespace, messages]) => [
      namespace,
      { ...messages, ...overrides[namespace as keyof D] },
    ]),
  ) as Translation<D>;
}

/** `"customers.empty"`: the namespace, a dot, the key. */
export type MessageKey<D extends Dictionary> = {
  [N in keyof D & string]: `${N}.${keyof D[N] & string}`;
}[keyof D & string];

type MessageAt<D extends Dictionary, K extends string> = K extends `${infer N}.${infer Key}`
  ? D[N][Key]
  : never;

/** `"Hi {name}, you have {count}"` → `"name" | "count"`. Tags like `<link>` are not placeholders. */
export type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never;

/** Numbers and dates are formatted for the language; strings go in as they are. */
export type ParamValue = string | number | Date;

type PluralParams<M extends PluralMessage> = { count: number } & {
  [P in Exclude<Placeholders<Extract<M[keyof M], string>>, "count">]: ParamValue;
};

export type ParamsOf<M> = M extends string
  ? [Placeholders<M>] extends [never]
    ? undefined
    : { [P in Placeholders<M>]: ParamValue }
  : M extends PluralMessage
    ? PluralParams<M>
    : never;

/** The arguments after the key: nothing for a plain text, the values its placeholders need. */
export type ParamsArg<D extends Dictionary, K extends MessageKey<D>> =
  ParamsOf<MessageAt<D, K>> extends undefined ? [] : [params: ParamsOf<MessageAt<D, K>>];

export interface Translator<D extends Dictionary> {
  locale: Locale;
  <K extends MessageKey<D>>(key: K, ...params: ParamsArg<D, K>): string;
}

const numberFormats = new Map<Locale, Intl.NumberFormat>();
const dateFormats = new Map<Locale, Intl.DateTimeFormat>();
const pluralRules = new Map<Locale, Intl.PluralRules>();

function cached<T>(cache: Map<Locale, T>, locale: Locale, create: () => T): T {
  let value = cache.get(locale);
  if (!value) {
    value = create();
    cache.set(locale, value);
  }
  return value;
}

export function formatValue(locale: Locale, value: ParamValue): string {
  if (typeof value === "number") {
    return cached(numberFormats, locale, () => new Intl.NumberFormat(locale)).format(value);
  }
  if (value instanceof Date) {
    const format = () => new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
    return cached(dateFormats, locale, format).format(value);
  }
  return value;
}

export function pluralForm(locale: Locale, message: PluralMessage, count: number): string {
  if (count === 0 && message.zero !== undefined) return message.zero;
  const rule = cached(pluralRules, locale, () => new Intl.PluralRules(locale)).select(count);
  return message[rule] ?? message.other;
}

/** Fills `{name}` placeholders. One left without a value stays as it is, so it shows up in review. */
export function interpolate(
  locale: Locale,
  template: string,
  params: Record<string, ParamValue> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = params[name];
    return value === undefined ? placeholder : formatValue(locale, value);
  });
}

/**
 * Translates with the namespaces at hand. Each route only receives its own namespaces, so
 * `messages` is usually a part of the dictionary; a key that isn't there comes back as the key.
 */
export function createTranslator<D extends Dictionary>(
  locale: Locale,
  messages: Partial<Record<string, Namespace>>,
): Translator<D> {
  function t(key: string, params?: Record<string, ParamValue>): string {
    const dot = key.indexOf(".");
    const message = messages[key.slice(0, dot)]?.[key.slice(dot + 1)];
    if (message === undefined) return key;
    const template =
      typeof message === "string"
        ? message
        : pluralForm(locale, message, Number(params?.count ?? 0));
    return interpolate(locale, template, params);
  }
  return Object.assign(t, { locale }) as Translator<D>;
}

export type RichPart<T> = string | { tag: string; node: T };

/**
 * Splits a translated text on its tags so each one becomes a component:
 * `"Read the <terms>terms</terms>"` + `{ terms: (text) => <Link>{text}</Link> }`.
 * Tags don't nest; one without a renderer stays as plain text.
 */
export function splitRich<T>(
  text: string,
  renderers: Record<string, (chunk: string) => T>,
): RichPart<T>[] {
  const parts: RichPart<T>[] = [];
  let last = 0;
  for (const match of text.matchAll(/<(\w+)>(.*?)<\/\1>/gs)) {
    const [whole, tag = "", chunk = ""] = match;
    if (match.index > last) parts.push(text.slice(last, match.index));
    const render = renderers[tag];
    parts.push(render ? { tag, node: render(chunk) } : chunk);
    last = match.index + whole.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
