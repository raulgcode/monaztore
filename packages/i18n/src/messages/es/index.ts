import type { Translation } from "../../translate";
import type { en } from "../en";
import { auth } from "./auth";
import { common } from "./common";
import { design } from "./design";
import { einvoicing } from "./einvoicing";
import { email } from "./email";
import { forms } from "./forms";
import { home } from "./home";
import { orders } from "./orders";
import { pages } from "./pages";
import { settings } from "./settings";
import { store } from "./store";
import { storefront } from "./storefront";
import { workspace } from "./workspace";

export const es = {
  auth,
  common,
  design,
  einvoicing,
  email,
  forms,
  home,
  orders,
  pages,
  settings,
  store,
  storefront,
  workspace,
} as const satisfies Translation<typeof en>;
