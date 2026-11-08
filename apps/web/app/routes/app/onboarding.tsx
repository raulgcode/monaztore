import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { createWorkspaceSchema } from "@monaztore/contracts";
import { canOpenWorkspace, uniqueSlug } from "@monaztore/core";
import { data, Form, href, redirect, useNavigation } from "react-router";
import { StandalonePage } from "~/components/standalone-page";
import { TextField } from "~/components/text-field";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { metaT, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { auth, db, env } from "~/lib/services.server";
import type { Route } from "./+types/onboarding";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("workspace.onboardingTitle") }];
}

export async function loader({ context }: Route.LoaderArgs) {
  return {
    open: await canOpenWorkspace(db, env.STORE_MODE),
    i18n: translations(context, "workspace", "forms"),
  };
}

export async function action({ request }: Route.ActionArgs) {
  // A standalone store has one workspace: once it exists, the rest join it by invitation.
  if (!(await canOpenWorkspace(db, env.STORE_MODE))) {
    throw data("This instance already has its store", { status: 403 });
  }
  const submission = parseWithZod(await request.formData(), { schema: createWorkspaceSchema });
  if (submission.status !== "success") {
    return data({ result: submission.reply() }, { status: 400 });
  }
  // The server picks the slug (with a random suffix); /organization/create is off over HTTP.
  const slug = uniqueSlug(submission.value.name);
  await auth.api.createOrganization({
    body: { name: submission.value.name, slug },
    headers: request.headers,
  });
  throw redirect(href("/app/:workspace", { workspace: slug }));
}

export default function Onboarding({ loaderData, actionData }: Route.ComponentProps) {
  const t = useT();
  const navigation = useNavigation();
  const [form, fields] = useForm({
    id: "onboarding",
    lastResult: actionData?.result,
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: createWorkspaceSchema }),
  });

  return (
    <StandalonePage signOut>
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl">{t("workspace.onboardingHeading")}</h1>
          </CardTitle>
          <CardDescription>
            {loaderData.open ? t("workspace.onboardingIntro") : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loaderData.open ? null : <p role="status">{t("workspace.onboardingClosed")}</p>}
          <Form
            method="post"
            className="grid gap-4"
            hidden={!loaderData.open}
            {...getFormProps(form)}
          >
            <TextField
              field={fields.name}
              label={t("workspace.nameLabel")}
              placeholder={t("workspace.namePlaceholder")}
              autoComplete="organization"
            />
            <Button type="submit" disabled={navigation.state === "submitting"}>
              {navigation.state === "submitting" ? t("workspace.creating") : t("workspace.create")}
            </Button>
          </Form>
        </CardContent>
      </Card>
    </StandalonePage>
  );
}
