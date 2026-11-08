import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import type { Route } from "./+types/root";
import "./app.css";
import { DevToolsLink } from "./components/dev-tools-link";
import { ErrorPage } from "./components/error-page";
import { NavigationProgress } from "./components/navigation-progress";
import { useTheme } from "./components/theme-toggle";
import { localeContext } from "./context";
import { themeBackground } from "./lib/brand";
import { useLocale, useT } from "./lib/i18n";
import { localeMiddleware, translations } from "./lib/locale.server";
import { readTheme } from "./lib/theme.server";
import { securityMiddleware } from "./middleware/security.server";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
];

export const middleware: Route.MiddlewareFunction[] = [securityMiddleware, localeMiddleware];

export async function loader({ request, context }: Route.LoaderArgs) {
  // `common` holds what every page uses (header, menus, errors); routes add their own namespaces.
  return {
    theme: await readTheme(request),
    locale: context.get(localeContext),
    i18n: translations(context, "common"),
  };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const locale = useLocale();
  return (
    // `system` leaves data-theme unset so CSS follows prefers-color-scheme.
    <html lang={locale} data-theme={theme === "system" ? undefined : theme}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <ThemeColor theme={theme} />
        <Meta />
        {/* Stylesheets need no nonce (style-src 'self'), and the nonce that <ServerRouter> passes
            down never reaches the browser: without this the <link>s differ on hydration. */}
        <Links nonce="" />
      </head>
      <body>
        <NavigationProgress />
        {children}
        {import.meta.env.DEV ? <DevToolsLink /> : null}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

// Browser chrome color (status bar on Android, PWA title bar) matching the page background.
function ThemeColor({ theme }: { theme: ReturnType<typeof useTheme> }) {
  const { light, dark } = themeBackground;
  if (theme !== "system") {
    return <meta name="theme-color" content={theme === "dark" ? dark : light} />;
  }
  return (
    <>
      <meta name="theme-color" media="(prefers-color-scheme: light)" content={light} />
      <meta name="theme-color" media="(prefers-color-scheme: dark)" content={dark} />
    </>
  );
}

export default function App() {
  return <Outlet />;
}

// A middleware that throws before the loaders run (a workspace that isn't yours) leaves the root
// without loader data, and so without `common`: these few texts stay in the bundle, in English.
const errorTexts = {
  common: {
    appName: "Monaztore",
    errorTitle: "Oops, something went wrong",
    errorDetails: "It wasn't your fault. Try again in a moment.",
    errorStatus: "Error {status}",
    errorRetry: "Try again",
    errorHome: "Go home",
    notFoundTitle: "We couldn't find this page",
    notFoundDetails: "The link may be incomplete, or the page no longer exists.",
  },
};

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const t = useT(errorTexts);
  // The status text of a response is for developers ("Bad Request"): people get a kind message.
  const status = isRouteErrorResponse(error) ? error.status : undefined;
  const stack = import.meta.env.DEV && error instanceof Error ? error.stack : undefined;
  return <ErrorPage t={t} status={status} stack={stack} />;
}
