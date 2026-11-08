import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { APIError } from "@monaztore/auth";
import { resetPasswordSchema } from "@monaztore/contracts";
import { data, Form, href, Link, useNavigation } from "react-router";
import { StandalonePage } from "~/components/standalone-page";
import { TextField } from "~/components/text-field";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { metaT, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { auth } from "~/lib/services.server";
import { requireMethod } from "~/lib/sign-in.server";
import type { Route } from "./+types/reset-password";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("auth.resetTitle") }];
}

/** Better Auth's email link lands here with `?token=` (or `?error=INVALID_TOKEN`). */
export async function loader({ url, context }: Route.LoaderArgs) {
  requireMethod("password");
  const token = url.searchParams.get("token");
  return {
    token: url.searchParams.has("error") ? null : token,
    i18n: translations(context, "auth", "forms"),
  };
}

export async function action({ request }: Route.ActionArgs) {
  requireMethod("password");
  const submission = parseWithZod(await request.formData(), { schema: resetPasswordSchema });
  if (submission.status !== "success") {
    return data(
      { result: submission.reply({ hideFields: ["password"] }), status: null },
      { status: 400 },
    );
  }
  try {
    await auth.api.resetPassword({
      body: { token: submission.value.token, newPassword: submission.value.password },
      headers: request.headers,
    });
  } catch (error) {
    if (!(error instanceof APIError)) throw error;
    return data({ result: submission.reply(), status: "invalid" as const }, { status: 400 });
  }
  return data({ result: submission.reply({ resetForm: true }), status: "done" as const });
}

export default function ResetPassword({ loaderData, actionData }: Route.ComponentProps) {
  const t = useT();
  const navigation = useNavigation();
  const [form, fields] = useForm({
    id: "reset-password",
    lastResult: actionData?.result,
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: resetPasswordSchema }),
  });
  const status = loaderData.token ? actionData?.status : "invalid";

  return (
    <StandalonePage>
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl">{t("auth.resetHeading")}</h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          {status === "invalid" ? (
            <p role="alert" className="text-destructive">
              {t("auth.resetInvalid")}
            </p>
          ) : null}
          {status === "done" ? <p role="status">{t("auth.resetDone")}</p> : null}
          {loaderData.token && status !== "done" ? (
            <Form method="post" className="grid gap-4" {...getFormProps(form)}>
              <input type="hidden" name="token" value={loaderData.token} />
              <TextField
                field={fields.password}
                label={t("auth.newPasswordLabel")}
                type="password"
                autoComplete="new-password"
              />
              <Button type="submit" disabled={navigation.state === "submitting"}>
                {t("auth.resetSave")}
              </Button>
            </Form>
          ) : null}
          <Link
            to={status === "invalid" ? href("/forgot-password") : `${href("/login")}?with=password`}
            className="justify-self-center py-2 text-sm font-medium text-link underline underline-offset-4"
          >
            {status === "invalid" ? t("auth.forgotSend") : t("auth.backToSignIn")}
          </Link>
        </CardContent>
      </Card>
    </StandalonePage>
  );
}
