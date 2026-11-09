import { admin } from "./admin";
import { ai } from "./ai";
import { auth } from "./auth";
import { common } from "./common";
import { coupons } from "./coupons";
import { design } from "./design";
import { digital } from "./digital";
import { einvoicing } from "./einvoicing";
import { email } from "./email";
import { forms } from "./forms";
import { home } from "./home";
import { orders } from "./orders";
import { pages } from "./pages";
import { products } from "./products";
import { security } from "./security";
import { settings } from "./settings";
import { store } from "./store";
import { storefront } from "./storefront";
import { workspace } from "./workspace";

/** The source language. A new namespace is added here and in `es/index.ts`. */
export const en = {
  admin,
  ai,
  auth,
  common,
  coupons,
  design,
  digital,
  einvoicing,
  email,
  forms,
  home,
  orders,
  pages,
  products,
  security,
  settings,
  store,
  storefront,
  workspace,
} as const;
