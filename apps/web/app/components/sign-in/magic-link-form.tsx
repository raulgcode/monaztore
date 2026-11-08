import { getFormProps, type SubmissionResult, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { magicLinkSchema } from "@monaztore/contracts";
import { Form, useNavigation } from "react-router";
import { TextField } from "~/components/text-field";
import { Button } from "~/components/ui/button";
import { richText, useT } from "~/lib/i18n";

/** The email for a magic link; once sent, what to do next. Its route loads `auth` and `forms`. */
export function MagicLinkForm({
  lastResult,
  sentTo,
}: {
  lastResult?: SubmissionResult<string[]>;
  sentTo?: string | null;
}) {
  const t = useT();
  const navigation = useNavigation();
  const submitting =
    navigation.state === "submitting" && navigation.formData?.get("intent") === "magic-link";
  const [form, fields] = useForm({
    id: "magic-link",
    lastResult,
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: magicLinkSchema }),
  });

  if (sentTo) {
    return (
      <p role="status">
        {richText(
          t,
          "auth.sent",
          { email: (email) => <strong>{email}</strong> },
          { email: sentTo },
        )}
      </p>
    );
  }
  return (
    <Form method="post" className="grid gap-4" {...getFormProps(form)}>
      <input type="hidden" name="intent" value="magic-link" />
      <TextField
        field={fields.email}
        label={t("forms.emailLabel")}
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder={t("forms.emailPlaceholder")}
        description={t("auth.magicLinkHint")}
      />
      <Button type="submit" disabled={submitting}>
        {submitting ? t("auth.sending") : t("auth.send")}
      </Button>
    </Form>
  );
}
