import { Form, href } from "react-router";
import { LanguagePicker } from "~/components/language-picker";
import { PageHeader } from "~/components/page-header";
import { ThemeToggle } from "~/components/theme-toggle";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { sessionContext } from "~/context";
import { metaT, richText, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import type { Route } from "./+types/settings";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("settings.title") }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const { user } = context.get(sessionContext);
  return { email: user.email, i18n: translations(context, "settings") };
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  const t = useT();
  return (
    <>
      <PageHeader title={t("settings.title")} description={t("settings.intro")} />
      <div className="grid gap-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-4">
            <div className="grid gap-1.5">
              <CardTitle>
                <h2>{t("settings.appearance")}</h2>
              </CardTitle>
              <CardDescription>{t("settings.appearanceIntro")}</CardDescription>
            </div>
            <ThemeToggle />
          </CardHeader>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <LanguagePicker />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("settings.account")}</h2>
            </CardTitle>
            <CardDescription>
              {richText(
                t,
                "settings.signedInAs",
                { email: (text) => <strong>{text}</strong> },
                { email: loaderData.email },
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form method="post" action={href("/logout")}>
              <Button type="submit" variant="outline">
                {t("common.signOut")}
              </Button>
            </Form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
