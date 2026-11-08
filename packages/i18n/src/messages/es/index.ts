import type { Translation } from "../../translate";
import type { en } from "../en";
import { admin } from "./admin";
import { auth } from "./auth";
import { common } from "./common";
import { design } from "./design";
import { digital } from "./digital";
import { einvoicing } from "./einvoicing";
import { email } from "./email";
import { forms } from "./forms";
import { home } from "./home";
import { orders } from "./orders";
import { pages } from "./pages";
import { security } from "./security";
import { settings } from "./settings";
import { store } from "./store";
import { storefront } from "./storefront";
import { workspace } from "./workspace";

export const es = {
  admin,
  auth,
  common,
  design,
  digital,
  einvoicing,
  email,
  forms,
  home,
  orders,
  pages,
  security,
  settings,
  store,
  storefront,
  workspace,
} as const satisfies Translation<typeof en>;
