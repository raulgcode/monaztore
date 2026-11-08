import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { APIError } from "@monaztore/auth";
import { signUpSchema } from "@monaztore/contracts";
import { data, Form, href, Link, redirect, useNavigation } from "react-router";
import { GoogleButton, OrWithEmail } from "~/components/sign-in/google-button";
import { StandalonePage } from "~/components/standalone-page";
import { TextField } from "~/components/text-field";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { metaT, richText, useT } from "~/lib/i18n";
import { localeOf, translations } from "~/lib/locale.server";
import { requestAddress, withinRateLimits } from "~/lib/rate-limit.server";
import { auth, authMethods } from "~/lib/services.server";
import { requireMethod, signInAction } from "~/lib/sign-in.server";
import type { Route } from "./+types/sign-up";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("auth.signUpTitle") }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  requireMethod("password");
  if (await auth.api.getSession({ headers: request.headers })) throw redirect(href("/app"));
  return {
    google: authMethods.includes("google"),
    i18n: translations(context, "auth", "forms"),
  };
}

export async function action(args: Route.ActionArgs) {
  const { request, context } = args;
  requireMethod("password");
  const formData = await request.clone().formData();
  // "Continue with Google" signs up too: the same action as /login.
  if (formData.get("intent") === "google") return signInAction(args);

  const submission = parseWithZod(formData, { schema: signUpSchema });
  const reply = (fieldErrors?: Record<string, string[]>, status = 400) =>
    data(
      { result: submission.reply({ hideFields: ["password"], fieldErrors }), sentTo: null },
      { status },
    );
  if (submission.status !== "success") return reply();
  // A sign-up sends the confirmation email: the same limits as any sign-in email.
  const allowed = await withinRateLimits([
    ["signInIp", requestAddress(request)],
    ["signInEmail", submission.value.email],
  ]);
  if (!allowed) return reply({ email: ["forms.tooManyAttempts"] }, 429);

  try {
    await auth.api.signUpEmail({
      body: { ...submission.value, callbackURL: href("/app"), locale: localeOf(context) },
      headers: request.headers,
    });
  } catch (error) {
    if (!(error instanceof APIError)) throw error;
    if (error.status === "UNPROCESSABLE_ENTITY") return reply({ email: ["auth.emailTaken"] });
    throw error;
  }
  return data({ result: submission.reply({ resetForm: true }), sentTo: submission.value.email });
}

export default function SignUp({ loaderData, actionData }: Route.ComponentProps) {
  const t = useT();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting" && navigation.formData?.has("password");
  const [form, fields] = useForm({
    id: "sign-up",
    lastResult: actionData?.result,
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: signUpSchema }),
  });

  if (actionData?.sentTo) {
    return (
      <StandalonePage>
        <Card>
          <CardHeader>
            <CardTitle>
              <h1 className="text-xl">{t("auth.checkEmailHeading")}</h1>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p role="status">
              {richText(
                t,
                "auth.checkEmailBody",
                { email: (text) => <strong>{text}</strong> },
                { email: actionData.sentTo },
              )}
            </p>
          </CardContent>
        </Card>
      </StandalonePage>
    );
  }

  return (
    <StandalonePage>
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl">{t("auth.signUpHeading")}</h1>
          </CardTitle>
          <CardDescription>{t("auth.signUpIntro")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {loaderData.google ? (
            <>
              <GoogleButton />
              <OrWithEmail />
            </>
          ) : null}
          <Form method="post" className="grid gap-4" {...getFormProps(form)}>
            <TextField field={fields.name} label={t("auth.nameLabel")} autoComplete="name" />
            <TextField
              field={fields.email}
              label={t("forms.emailLabel")}
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder={t("forms.emailPlaceholder")}
            />
            <TextField
              field={fields.password}
              label={t("auth.passwordLabel")}
              type="password"
              autoComplete="new-password"
            />
            <Button type="submit" disabled={submitting}>
              {submitting ? t("auth.signingUp") : t("auth.signUp")}
            </Button>
          </Form>
          <p className="text-center text-sm text-muted-foreground">
            {richText(t, "auth.haveAccount", {
              link: (text) => (
                <Link
                  to={`${href("/login")}?with=password`}
                  className="font-medium text-link underline underline-offset-4"
                >
                  {text}
                </Link>
              ),
            })}
          </p>
        </CardContent>
      </Card>
    </StandalonePage>
  );
}
