import { index, layout, prefix, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  // Public pages. On a store's domain (`storeMiddleware`) they are the storefront; on the
  // platform's host, the landing, and the store-only pages answer 404.
  layout("routes/store/layout.tsx", [
    index("routes/home.tsx"),
    route("products", "routes/store/products.tsx"),
    route("products/:slug", "routes/store/product.tsx"),
    route("collections", "routes/store/collections.tsx"),
    route("collections/:slug", "routes/store/collection.tsx"),
    route("cart", "routes/store/cart.tsx"),
    route("checkout", "routes/store/checkout.tsx"),
    route("orders/:token", "routes/store/order.tsx"),
    route("orders/:token/:file", "routes/store/order-file.ts"),
    // A paid order's digital products: from its page, and from the downloads email's own link.
    route("orders/:token/downloads/:id", "routes/store/order-download.ts"),
    route("downloads/:token", "routes/store/downloads.tsx"),
    route("downloads/:token/:id", "routes/store/link-download.ts"),
    // What the search box suggests as the shopper types (JSON, read with a fetcher).
    route("search", "routes/store/search.ts"),
    route("sitemap.xml", "routes/store/sitemap.ts"),
    route("robots.txt", "routes/store/robots.ts"),
    // Last: old addresses of a migrated shop (301) and every other 404.
    route("*", "routes/store/fallback.tsx"),
  ]),
  // A store's files (product photos), named by their contents: `/media/organizations/<id>/…`.
  route("media/*", "routes/media.ts"),
  route("login", "routes/login.tsx"),
  // Email and password: only answer when AUTH_METHODS has "password" (404 otherwise).
  route("sign-up", "routes/sign-up.tsx"),
  route("forgot-password", "routes/forgot-password.tsx"),
  route("reset-password", "routes/reset-password.tsx"),
  route("logout", "routes/logout.ts"),
  route("theme", "routes/theme.ts"),
  route("locale", "routes/locale.ts"),
  route("api/auth/*", "routes/api.auth.ts"),
  // Local tools (sign in as any user). Never in a production build: see lib/dev-tools.server.ts.
  ...(process.env.NODE_ENV === "production"
    ? []
    : [route("dev/sign-in", "routes/dev/sign-in.tsx")]),
  // The platform's own panel: super admins only, after their second step (authenticator app or
  // passkey). Anyone else gets a 404, as if it did not exist.
  ...prefix("admin", [
    route("mfa", "routes/admin/mfa.tsx"),
    // Leaves a store's account ("Back to admin"): it runs inside the owner's session.
    route("support/stop", "routes/admin/stop-support.ts"),
    layout("routes/admin/layout.tsx", [
      index("routes/admin/stores.tsx"),
      route("stores/:storeId", "routes/admin/store.tsx"),
      route("commission", "routes/admin/commission.tsx"),
      route("log", "routes/admin/log.tsx"),
      route("security", "routes/admin/security.tsx"),
    ]),
  ]),
  ...prefix("app", [
    // The team's second step (authenticator app or passkey), before anything else under /app.
    route("mfa", "routes/app/mfa.tsx"),
    layout("routes/app/layout.tsx", [
      index("routes/app/open-workspace.ts"),
      route("onboarding", "routes/app/onboarding.tsx"),
      // Workspace slugs always end in a random suffix, so they never match the paths above.
      route(":workspace", "routes/app/workspace-layout.tsx", [
        index("routes/app/home.tsx"),
        route("orders", "routes/app/orders.tsx"),
        route("orders/:number", "routes/app/order.tsx"),
        // The catalog: products (list and editor), their collections and the discount coupons.
        route("products", "routes/app/products.tsx"),
        route("products/images", "routes/app/product-images.ts"),
        route("products/search", "routes/app/product-search.ts"),
        route("products/:productId", "routes/app/product.tsx"),
        route("collections", "routes/app/collections.tsx"),
        route("coupons", "routes/app/coupons.tsx"),
        route("coupons/:couponId", "routes/app/coupon.tsx"),
        route("pages", "routes/app/pages.tsx"),
        route("pages/:pageId", "routes/app/page-editor.tsx"),
        route("store", "routes/app/store.tsx"),
        // Digital products: files buyers download once paid (linked from Store, not a bar item).
        route("downloads", "routes/app/digital-products.tsx"),
        route("downloads/new", "routes/app/digital-product-new.tsx"),
        route("downloads/:productId", "routes/app/digital-product.tsx"),
        route("design", "routes/app/design.tsx"),
        // Costa Rica's electronic invoicing (Hacienda): 404 for stores anywhere else.
        route("invoicing", "routes/app/invoicing.tsx"),
        route("invoicing/:id/:file", "routes/app/invoicing-file.ts"),
        route("settings", "routes/app/settings.tsx"),
        route("settings/security", "routes/app/security.tsx"),
      ]),
    ]),
  ]),
] satisfies RouteConfig;
