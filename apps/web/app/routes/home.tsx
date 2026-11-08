import { href, Link } from "react-router";
import { StandalonePage } from "~/components/standalone-page";
import { buttonVariants } from "~/components/ui/button";
import { metaT, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { auth } from "~/lib/services.server";
import type { Route } from "./+types/home";

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return [{ title: t("home.title") }, { name: "description", content: t("home.description") }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await auth.api.getSession({ headers: request.headers });
  return { signedIn: Boolean(session), i18n: translations(context, "home") };
}

/** The public front door: replace it with your project's landing. */
export default function Home({ loaderData }: Route.ComponentProps) {
  const t = useT();
  return (
    <StandalonePage>
      <div className="grid gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">{t("home.heading")}</h1>
        <p className="text-lg text-muted-foreground">{t("home.intro")}</p>
        <Link
          to={loaderData.signedIn ? href("/app") : href("/login")}
          className={buttonVariants({ className: "justify-self-start" })}
        >
          {loaderData.signedIn ? t("home.openApp") : t("home.signIn")}
        </Link>
      </div>
    </StandalonePage>
  );
}
