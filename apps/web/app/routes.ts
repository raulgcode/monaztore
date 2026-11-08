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
    route("sitemap.xml", "routes/store/sitemap.ts"),
    route("robots.txt", "routes/store/robots.ts"),
    // Last: old addresses of a migrated shop (301) and every other 404.
    route("*", "routes/store/fallback.tsx"),
  ]),
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
  ...prefix("app", [
    layout("routes/app/layout.tsx", [
      index("routes/app/open-workspace.ts"),
      route("onboarding", "routes/app/onboarding.tsx"),
      // Workspace slugs always end in a random suffix, so they never match the paths above.
      route(":workspace", "routes/app/workspace-layout.tsx", [
        index("routes/app/home.tsx"),
        route("orders", "routes/app/orders.tsx"),
        route("orders/:number", "routes/app/order.tsx"),
        route("store", "routes/app/store.tsx"),
        route("settings", "routes/app/settings.tsx"),
      ]),
    ]),
  ]),
] satisfies RouteConfig;
