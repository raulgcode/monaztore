import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { aiConsentSchema } from "@monaztore/contracts";
import { listMemberships, mfaState, TEAM_MFA_TTL_MS } from "@monaztore/core";
import { CheckIcon, ShieldCheckIcon } from "lucide-react";
import { useEffect } from "react";
import { data, Form, href, redirect, useNavigation } from "react-router";
import { StandalonePage } from "~/components/standalone-page";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { metaT, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { isSignedConsentQuery } from "~/lib/oauth.server";
import { auth, db } from "~/lib/services.server";
import type { Route } from "./+types/consent";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("ai.title") }, { name: "robots", content: "noindex" }];
}

/**
 * The person allowing the assistant, signed in and past the team's second step in this session:
 * the assistant gets what they can do in their stores. Support (a super admin inside someone's
 * account) never connects one: the account isn't theirs.
 */
async function personFor(request: Request, url: URL) {
  const found = await auth.api.getSession({ headers: request.headers });
  // /login resumes the request once they sign in.
  if (!found) throw redirect(`${href("/login")}${url.search}`);
  if (found.session.impersonatedBy) throw data("Not during support", { status: 404 });
  const state = await mfaState({ db, userId: found.user.id }, found.session.id, TEAM_MFA_TTL_MS);
  if (state !== "verified") {
    throw redirect(
      `${href("/app/mfa")}?redirectTo=${encodeURIComponent(`${url.pathname}${url.search}`)}`,
    );
  }
  return found;
}

/**
 * AI assistants: an assistant (Claude, ChatGPT…) asks to connect to the person's stores.
 * Better Auth sends them here with the signed request after they sign in; they allow it or not.
 */
export async function loader({ request, url, context }: Route.LoaderArgs) {
  const i18n = translations(context, "ai", "forms");
  const clientId = url.searchParams.get("client_id");
  if (!clientId || !(await isSignedConsentQuery(url))) return { expired: true as const, i18n };
  const { user } = await personFor(request, url);
  const [client, memberships] = await Promise.all([
    auth.api.getOAuthClientPublic({ query: { client_id: clientId }, headers: request.headers }),
    listMemberships(db, user.id),
  ]);
  return {
    expired: false as const,
    client: { name: client.client_name ?? null, uri: client.client_uri ?? null },
    stores: memberships.map(({ name, slug }) => ({ name, slug })),
    email: user.email,
    i18n,
  };
}

// `url`, not `request.url`: on a client navigation React Router adds `_routes` to the query,
// which would break the signature.
export async function action({ request, url }: Route.ActionArgs) {
  if (!(await isSignedConsentQuery(url))) throw data("Expired consent request", { status: 400 });
  await personFor(request, url);
  const submission = parseWithZod(await request.formData(), { schema: aiConsentSchema });
  if (submission.status !== "success") {
    return data({ result: submission.reply(), redirectTo: null }, { status: 400 });
  }
  const { url: redirectTo } = await auth.api.oauth2Consent({
    body: { accept: submission.value.intent === "allow", oauth_query: url.searchParams.toString() },
    headers: request.headers,
    // Accepting runs the authorize step, which reads the request (only its headers).
    request,
    asResponse: false,
  });
  // The assistant's own address (claude.ai, chatgpt.com, an editor on 127.0.0.1), which Better
  // Auth checked against the ones it registered. Not a redirect of this POST: the policy's
  // `form-action` would stop it, so the browser goes there from the page.
  return { result: null, redirectTo };
}

export default function Consent({ loaderData, actionData }: Route.ComponentProps) {
  const t = useT();
  const navigation = useNavigation();
  const redirectTo = actionData?.redirectTo;
  const [form] = useForm({
    lastResult: actionData?.result ?? undefined,
    onValidate: ({ formData }) => parseWithZod(formData, { schema: aiConsentSchema }),
  });

  // Leaving for the assistant is a browser effect: the answer already came from the action.
  useEffect(() => {
    if (redirectTo) window.location.replace(redirectTo);
  }, [redirectTo]);

  if (loaderData.expired) {
    return (
      <StandalonePage>
        <h1 className="sr-only">{t("ai.title")}</h1>
        <p role="alert" className="rounded-lg border bg-muted p-4">
          {t("ai.consentExpired")}
        </p>
      </StandalonePage>
    );
  }

  const { client, stores, email } = loaderData;
  const clientName = client.name ?? t("ai.unknownClient");
  const busy = navigation.state !== "idle" || Boolean(redirectTo);

  return (
    <StandalonePage>
      <Card>
        <CardHeader>
          <span
            aria-hidden
            className="mb-2 grid size-11 place-items-center rounded-xl bg-muted text-primary"
          >
            <ShieldCheckIcon className="size-6" />
          </span>
          <CardTitle>
            <h1 className="text-xl">{t("ai.consentTitle", { client: clientName })}</h1>
          </CardTitle>
          {client.uri ? (
            <CardDescription className="break-all">{client.uri}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-2">
            <p>{t("ai.consentIntro")}</p>
            <ul className="grid gap-2">
              {(["ai.consentCatalog", "ai.consentOrders"] as const).map((key) => (
                <li key={key} className="flex gap-2">
                  <CheckIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
                  <span>{t(key)}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">{t("ai.consentAsks")}</p>
          </div>
          <section aria-labelledby="consent-stores" className="grid gap-2">
            <h2 id="consent-stores" className="font-semibold">
              {t("ai.consentStores")}
            </h2>
            {stores.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("ai.consentNoStores")}</p>
            ) : (
              <ul className="grid gap-2">
                {stores.map((store) => (
                  <li key={store.slug} className="rounded-md border px-3 py-2 font-medium">
                    {store.name}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="text-sm text-muted-foreground">
            {t("ai.consentSignedInAs", { email })} {t("ai.consentRemoveLater")}
          </p>
          {redirectTo ? (
            // Only if the browser didn't move on by itself.
            <a className="text-link underline underline-offset-4" href={redirectTo}>
              {clientName}
            </a>
          ) : null}
          {/* The answer at the bottom, under the thumb: allow first, then the way out. */}
          <Form method="post" {...getFormProps(form)}>
            <div className="grid gap-2 sm:flex sm:flex-row-reverse sm:justify-start">
              <Button
                type="submit"
                name="intent"
                value="allow"
                className="min-h-11"
                disabled={busy}
              >
                {busy ? t("ai.allowing") : t("ai.allow")}
              </Button>
              <Button
                type="submit"
                name="intent"
                value="deny"
                className="min-h-11"
                variant="outline"
                disabled={busy}
              >
                {t("ai.deny")}
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>
    </StandalonePage>
  );
}
