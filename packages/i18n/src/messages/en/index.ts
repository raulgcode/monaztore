import { auth } from "./auth";
import { common } from "./common";
import { design } from "./design";
import { email } from "./email";
import { forms } from "./forms";
import { home } from "./home";
import { orders } from "./orders";
import { pages } from "./pages";
import { settings } from "./settings";
import { store } from "./store";
import { storefront } from "./storefront";
import { workspace } from "./workspace";

/** The source language. A new namespace is added here and in `es/index.ts`. */
export const en = {
  auth,
  common,
  design,
  email,
  forms,
  home,
  orders,
  pages,
  settings,
  store,
  storefront,
  workspace,
} as const;
