import { getFormProps, type SubmissionResult, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { passwordSignInSchema } from "@monaztore/contracts";
import { Form, href, Link, useNavigation } from "react-router";
import { TextField } from "~/components/text-field";
import { Button } from "~/components/ui/button";
import { richText, useT } from "~/lib/i18n";

/** Email and password, with the way to a new one. Its route loads `auth` and `forms`. */
export function PasswordForm({
  lastResult,
  failure,
  email,
}: {
  lastResult?: SubmissionResult<string[]>;
  failure?: "invalid" | "unverified" | null;
  email?: string | null;
}) {
  const t = useT();
  const navigation = useNavigation();
  const submitting =
    navigation.state === "submitting" && navigation.formData?.get("intent") === "password";
  const [form, fields] = useForm({
    id: "password",
    lastResult,
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: passwordSignInSchema }),
  });

  return (
    <Form method="post" className="grid gap-4" {...getFormProps(form)}>
      <input type="hidden" name="intent" value="password" />
      {failure === "invalid" ? (
        <p role="alert" className="text-sm text-destructive">
          {t("auth.wrongPassword")}
        </p>
      ) : null}
      {failure === "unverified" && email ? (
        <p role="alert" className="text-sm">
          {richText(
            t,
            "auth.emailNotVerified",
            { email: (text) => <strong>{text}</strong> },
            { email },
          )}
        </p>
      ) : null}
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
        autoComplete="current-password"
      />
      <Link
        to={href("/forgot-password")}
        className="-mt-1 justify-self-start py-2 text-sm font-medium text-link underline underline-offset-4"
      >
        {t("auth.forgotLink")}
      </Link>
      <Button type="submit" disabled={submitting}>
        {submitting ? t("auth.signingIn") : t("auth.signInWithPassword")}
      </Button>
    </Form>
  );
}
