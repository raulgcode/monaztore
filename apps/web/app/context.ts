import type { AuthSession } from "@monaztore/auth";
import type { PlatformAdminContext, StorefrontContext, TenantContext } from "@monaztore/core";
import { defaultLocale, type Locale } from "@monaztore/i18n";
import { createContext } from "react-router";

/** Set by `requireSession` for every route under /app. */
export const sessionContext = createContext<AuthSession>();

/** Set by `requireTenant`: the workspace in the URL, ready to pass to @monaztore/core. */
export const tenantContext = createContext<TenantContext>();

/** Set by `requireSuperAdminIdentity` for /admin: the platform's operator, checked in the database. */
export const superAdminContext = createContext<PlatformAdminContext>();

/** Set by `localeMiddleware` in root.tsx (and by `requireSession` from the account): the page's language. */
export const localeContext = createContext<Locale>(defaultLocale);

/** Set by `securityMiddleware`: the nonce of this page's inline scripts (see entry.server.tsx). */
export const nonceContext = createContext<string>("");

/**
 * Set by `storeMiddleware` when the request's Host is a store's domain: what the public storefront
 * reads. Null on the platform's own host (the landing, sign-in, the workspace).
 */
export const storeContext = createContext<StorefrontContext | null>(null);
