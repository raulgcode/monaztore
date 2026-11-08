import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { forgotPasswordSchema } from "@monaztore/contracts";
import { data, Form, href, Link, useNavigation } from "react-router";
import { StandalonePage } from "~/components/standalone-page";
import { TextField } from "~/components/text-field";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { metaT, richText, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { requestAddress, withinRateLimits } from "~/lib/rate-limit.server";
import { auth } from "~/lib/services.server";
import { requireMethod } from "~/lib/sign-in.server";
import type { Route } from "./+types/forgot-password";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("auth.forgotTitle") }];
}

export async function loader({ context }: Route.LoaderArgs) {
  requireMethod("password");
  return { i18n: translations(context, "auth", "forms") };
}

export async function action({ request }: Route.ActionArgs) {
  requireMethod("password");
  const submission = parseWithZod(await request.formData(), { schema: forgotPasswordSchema });
  if (submission.status !== "success") {
    return data({ result: submission.reply(), sentTo: null }, { status: 400 });
  }
  const allowed = await withinRateLimits([
    ["signInIp", requestAddress(request)],
    ["signInEmail", submission.value.email],
  ]);
  if (!allowed) {
    return data(
      {
        result: submission.reply({ fieldErrors: { email: ["forms.tooManyAttempts"] } }),
        sentTo: null,
      },
      { status: 429 },
    );
  }
  // Same answer whether the account exists or not: nobody learns who has one.
  await auth.api.requestPasswordReset({
    body: { email: submission.value.email, redirectTo: href("/reset-password") },
    headers: request.headers,
  });
  return data({ result: submission.reply({ resetForm: true }), sentTo: submission.value.email });
}

export default function ForgotPassword({ actionData }: Route.ComponentProps) {
  const t = useT();
  const navigation = useNavigation();
  const [form, fields] = useForm({
    id: "forgot-password",
    lastResult: actionData?.result,
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: forgotPasswordSchema }),
  });

  return (
    <StandalonePage>
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl">{t("auth.forgotHeading")}</h1>
          </CardTitle>
          <CardDescription>{t("auth.forgotIntro")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {actionData?.sentTo ? (
            <p role="status">
              {richText(
                t,
                "auth.forgotSent",
                { email: (text) => <strong>{text}</strong> },
                { email: actionData.sentTo },
              )}
            </p>
          ) : (
            <Form method="post" className="grid gap-4" {...getFormProps(form)}>
              <TextField
                field={fields.email}
                label={t("forms.emailLabel")}
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder={t("forms.emailPlaceholder")}
              />
              <Button type="submit" disabled={navigation.state === "submitting"}>
                {navigation.state === "submitting" ? t("auth.sending") : t("auth.forgotSend")}
              </Button>
            </Form>
          )}
          <Link
            to={`${href("/login")}?with=password`}
            className="justify-self-center py-2 text-sm font-medium text-link underline underline-offset-4"
          >
            {t("auth.backToSignIn")}
          </Link>
        </CardContent>
      </Card>
    </StandalonePage>
  );
}
