// Server only: every text of every language. Routes send the browser just the namespaces they
// use (apps/web/app/lib/locale.server.ts), so never import this from code that reaches the client.
import type { Locale } from "../locale";
import type { MessageKey, Translation } from "../translate";
import { en } from "./en";
import { es } from "./es";

export type Messages = typeof en;
export type Namespace = keyof Messages;
export type Key = MessageKey<Messages>;

export const dictionaries: Record<Locale, Translation<Messages>> = { en, es };
