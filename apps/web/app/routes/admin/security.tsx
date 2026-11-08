import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { passkeyNameSchema } from "@monaztore/contracts";
import {
  addPasskey,
  DomainError,
  listPasskeys,
  PASSKEYS_MAX,
  passkeyRegistrationOptions,
  removePasskey,
} from "@monaztore/core";
import {
  browserSupportsWebAuthn,
  type PublicKeyCredentialCreationOptionsJSON,
  type RegistrationResponseJSON,
  startRegistration,
  WebAuthnError,
} from "@simplewebauthn/browser";
import { FingerprintIcon } from "lucide-react";
import { useState } from "react";
import { data, type ShouldRevalidateFunctionArgs, useFetcher } from "react-router";
import { PageHeader } from "~/components/page-header";
import { TextField } from "~/components/text-field";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { sessionContext, superAdminContext } from "~/context";
import { metaT, useLocale, useT } from "~/lib/i18n";
import { serverT, translations } from "~/lib/locale.server";
import { deviceNameOf, passkeyResponseOf } from "~/lib/passkeys";
import { passkeyParty } from "~/lib/passkeys.server";
import type { Route } from "./+types/security";

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return [{ title: t("admin.titleSuffix", { title: t("admin.passkeysTitle") }) }];
}

// Each try uses up the challenge the loader handed out, so the page always asks for a new one.
export function shouldRevalidate({
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  return formMethod === "POST" ? true : defaultShouldRevalidate;
}

/**
 * The super admin's passkeys: fingerprint, face, the phone or a security key, to pass the
 * second step of /admin without typing the authenticator code. Each admin sees only their own.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const admin = context.get(superAdminContext);
  const { session, user } = context.get(sessionContext);
  const [passkeys, options] = await Promise.all([
    listPasskeys(admin),
    passkeyRegistrationOptions(admin, passkeyParty, {
      sessionId: session.id,
      userName: user.email,
    }),
  ]);
  return {
    passkeys,
    options,
    // From the loader: importing it from core would ship core to the browser.
    max: PASSKEYS_MAX,
    defaultName:
      deviceNameOf(request.headers.get("User-Agent") ?? "") ??
      serverT(context)("admin.passkeyDefaultName"),
    i18n: translations(context, "forms"),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const admin = context.get(superAdminContext);
  const { session } = context.get(sessionContext);
  const formData = await request.formData();

  if (formData.get("intent") === "remove") {
    await removePasskey(admin, String(formData.get("id")));
    return { result: null, outcome: "removed" as const, name: null };
  }

  const submission = parseWithZod(formData, { schema: passkeyNameSchema });
  if (submission.status !== "success") {
    return data({ result: submission.reply(), outcome: null, name: null }, { status: 400 });
  }
  const response = passkeyResponseOf<RegistrationResponseJSON>(formData.get("response"));
  try {
    const passkey = response
      ? await addPasskey(admin, passkeyParty, {
          sessionId: session.id,
          name: submission.value.name,
          response,
        })
      : null;
    if (passkey) {
      return {
        result: submission.reply({ resetForm: true }),
        outcome: "added" as const,
        name: passkey.name,
      };
    }
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    return data(
      { result: submission.reply(), outcome: "limit" as const, name: null },
      { status: 400 },
    );
  }
  return data(
    { result: submission.reply(), outcome: "failed" as const, name: null },
    { status: 400 },
  );
}

type Problem = "failed" | "alreadyHere" | "unsupported";

export default function AdminSecurity({ loaderData }: Route.ComponentProps) {
  const { passkeys, options, defaultName, max } = loaderData;
  const t = useT();
  const fetcher = useFetcher<typeof action>();
  const [waiting, setWaiting] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [form, fields] = useForm({
    id: "add-passkey",
    lastResult: fetcher.data?.result ?? undefined,
    defaultValue: { name: defaultName },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: passkeyNameSchema }),
    // The device makes the passkey first; the name and its response then go to the action.
    async onSubmit(event, { formData }) {
      event.preventDefault();
      setProblem(null);
      if (!browserSupportsWebAuthn()) {
        setProblem("unsupported");
        return;
      }
      setWaiting(true);
      try {
        // The loader's JSON loses the literal types ("public-key" turns into string): same object.
        const optionsJSON = options as PublicKeyCredentialCreationOptionsJSON;
        const response = await startRegistration({ optionsJSON });
        formData.set("response", JSON.stringify(response));
        await fetcher.submit(formData, { method: "post" });
      } catch (error) {
        setProblem(
          error instanceof WebAuthnError &&
            error.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED"
            ? "alreadyHere"
            : "failed",
        );
      } finally {
        setWaiting(false);
      }
    },
  });

  const outcome = waiting ? null : fetcher.data?.outcome;
  const busy = waiting || fetcher.state !== "idle";
  const full = passkeys.length >= max;
  const locale = useLocale();
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <>
      <PageHeader title={t("admin.passkeysTitle")} description={t("admin.passkeysIntro")} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("admin.passkeyAddHeading")}</h2>
            </CardTitle>
            <CardDescription>{t("admin.passkeyAddIntro")}</CardDescription>
          </CardHeader>
          <CardContent>
            <fetcher.Form method="post" className="grid gap-4" {...getFormProps(form)}>
              <TextField
                field={fields.name}
                label={t("admin.passkeyName")}
                description={t("admin.passkeyNameHint")}
                autoComplete="off"
              />
              {problem ? (
                <p role="alert" className="text-sm text-destructive">
                  {t(
                    problem === "alreadyHere"
                      ? "admin.passkeyAlreadyHere"
                      : problem === "unsupported"
                        ? "admin.passkeyUnsupported"
                        : "admin.passkeyFailed",
                  )}
                </p>
              ) : outcome === "added" && fetcher.data?.name ? (
                <p role="status" className="rounded-md bg-muted p-3 text-sm">
                  {t("admin.passkeyAdded", { name: fetcher.data.name })}
                </p>
              ) : outcome === "failed" || outcome === "limit" || full ? (
                <p role="alert" className="text-sm text-destructive">
                  {outcome === "failed"
                    ? t("admin.passkeyFailed")
                    : t("admin.passkeysLimit", { max })}
                </p>
              ) : null}
              <Button type="submit" disabled={busy || full}>
                <FingerprintIcon aria-hidden="true" />
                {waiting ? t("admin.passkeyAdding") : t("admin.passkeyAdd")}
              </Button>
            </fetcher.Form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("admin.passkeysListHeading")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {passkeys.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("admin.passkeysEmpty")}</p>
            ) : (
              <ul className="grid gap-4" aria-label={t("admin.passkeysListHeading")}>
                {passkeys.map((passkey) => (
                  <li key={passkey.id} className="flex flex-wrap items-center gap-3">
                    <FingerprintIcon aria-hidden="true" className="size-5 text-muted-foreground" />
                    <div className="grid min-w-0 flex-1 text-sm">
                      <p className="truncate text-base font-medium">{passkey.name}</p>
                      <p className="text-muted-foreground">
                        {t("admin.passkeyCreated", {
                          date: date.format(new Date(passkey.createdAt)),
                        })}
                      </p>
                      <p className="text-muted-foreground">
                        {passkey.lastUsedAt
                          ? t("admin.passkeyLastUsed", {
                              date: date.format(new Date(passkey.lastUsedAt)),
                            })
                          : t("admin.passkeyNeverUsed")}
                      </p>
                    </div>
                    <RemoveButton id={passkey.id} name={passkey.name} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function RemoveButton({ id, name }: { id: string; name: string }) {
  const fetcher = useFetcher();
  const t = useT();
  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="remove" />
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="outline"
        aria-label={t("admin.passkeyRemoveLabel", { name })}
        disabled={fetcher.state !== "idle"}
      >
        {t("admin.passkeyRemove")}
      </Button>
    </fetcher.Form>
  );
}
