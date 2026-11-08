import type { Translation } from "../../translate";
import type { en } from "../en";
import { auth } from "./auth";
import { common } from "./common";
import { email } from "./email";
import { forms } from "./forms";
import { home } from "./home";
import { settings } from "./settings";
import { storefront } from "./storefront";
import { workspace } from "./workspace";

export const es = {
  auth,
  common,
  email,
  forms,
  home,
  settings,
  storefront,
  workspace,
} as const satisfies Translation<typeof en>;
