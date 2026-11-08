import { href, Link, redirect } from "react-router";
import { GoogleButton, OrWithEmail } from "~/components/sign-in/google-button";
import { MagicLinkForm } from "~/components/sign-in/magic-link-form";
import { PasswordForm } from "~/components/sign-in/password-form";
import { StandalonePage } from "~/components/standalone-page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { metaT, richText, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { auth, authMethods } from "~/lib/services.server";
import { emailModeOf, signInAction } from "~/lib/sign-in.server";
import type { Route } from "./+types/login";

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return [{ title: t("auth.title") }, { name: "description", content: t("auth.description") }];
}

export async function loader({ request, url, context }: Route.LoaderArgs) {
  if (await auth.api.getSession({ headers: request.headers })) throw redirect(href("/app"));
  return {
    google: authMethods.includes("google"),
    mode: emailModeOf(url),
    // Each email method links to the other, keeping where they were going.
    other:
      authMethods.includes("password") && authMethods.includes("magic-link")
        ? emailModeOf(url) === "password"
          ? "link"
          : "password"
        : null,
    // Better Auth comes back with `?error=` when Google (or an expired link) fails.
    failed: url.searchParams.has("error"),
    i18n: translations(context, "auth", "forms"),
  };
}

export async function action(args: Route.ActionArgs) {
  return signInAction(args);
}

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
  const t = useT();
  const { google, mode, other, failed } = loaderData;

  return (
    <StandalonePage>
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl">{t("auth.heading")}</h1>
          </CardTitle>
          <CardDescription>{t("auth.intro")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {failed ? (
            <p role="alert" className="text-sm text-destructive">
              {t("auth.googleFailed")}
            </p>
          ) : null}
          {google ? <GoogleButton /> : null}
          {google && mode ? <OrWithEmail /> : null}
          {mode === "password" ? (
            <PasswordForm
              lastResult={actionData?.result}
              failure={actionData?.failure}
              email={actionData?.email}
            />
          ) : null}
          {mode === "magic-link" ? (
            <MagicLinkForm lastResult={actionData?.result} sentTo={actionData?.sentTo} />
          ) : null}
          {other ? (
            <Link
              to={`?with=${other}`}
              replace
              className="justify-self-center py-2 text-sm font-medium text-link underline underline-offset-4"
            >
              {other === "link" ? t("auth.useMagicLink") : t("auth.usePassword")}
            </Link>
          ) : null}
          {mode === "password" ? (
            <p className="text-center text-sm text-muted-foreground">
              {richText(t, "auth.noAccount", {
                link: (text) => (
                  <Link
                    to={href("/sign-up")}
                    className="font-medium text-link underline underline-offset-4"
                  >
                    {text}
                  </Link>
                ),
              })}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </StandalonePage>
  );
}
