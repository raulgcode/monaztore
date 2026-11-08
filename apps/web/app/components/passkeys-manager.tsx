import { getFormProps, type SubmissionResult, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { passkeyNameSchema } from "@monaztore/contracts";
import {
  browserSupportsWebAuthn,
  type PublicKeyCredentialCreationOptionsJSON,
  startRegistration,
  WebAuthnError,
} from "@simplewebauthn/browser";
import { FingerprintIcon } from "lucide-react";
import { useState } from "react";
import { type ShouldRevalidateFunctionArgs, useFetcher } from "react-router";
import { PageHeader } from "~/components/page-header";
import { TextField } from "~/components/text-field";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { useLocale, useT } from "~/lib/i18n";

// Each try uses up the challenge the loader handed out, so the page always asks for a new one.
export function passkeysShouldRevalidate({
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  return formMethod === "POST" ? true : defaultShouldRevalidate;
}

type Problem = "failed" | "alreadyHere" | "unsupported";

/** The list of the person's passkeys and the button that adds one on this device. */
export function PasskeysManager({
  loaderData,
}: {
  loaderData: {
    passkeys: {
      id: string;
      name: string;
      createdAt: string | Date;
      lastUsedAt: string | Date | null;
    }[];
    options: unknown;
    defaultName: string;
    max: number;
  };
}) {
  const { passkeys, options, defaultName, max } = loaderData;
  const t = useT();
  const fetcher = useFetcher<{
    result: SubmissionResult<string[]> | null;
    outcome: "added" | "removed" | "failed" | "limit" | null;
    name: string | null;
  }>();
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
      <PageHeader title={t("security.passkeysTitle")} description={t("security.passkeysIntro")} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("security.passkeyAddHeading")}</h2>
            </CardTitle>
            <CardDescription>{t("security.passkeyAddIntro")}</CardDescription>
          </CardHeader>
          <CardContent>
            <fetcher.Form method="post" className="grid gap-4" {...getFormProps(form)}>
              <TextField
                field={fields.name}
                label={t("security.passkeyName")}
                description={t("security.passkeyNameHint")}
                autoComplete="off"
              />
              {problem ? (
                <p role="alert" className="text-sm text-destructive">
                  {t(
                    problem === "alreadyHere"
                      ? "security.passkeyAlreadyHere"
                      : problem === "unsupported"
                        ? "security.passkeyUnsupported"
                        : "security.passkeyFailed",
                  )}
                </p>
              ) : outcome === "added" && fetcher.data?.name ? (
                <p role="status" className="rounded-md bg-muted p-3 text-sm">
                  {t("security.passkeyAdded", { name: fetcher.data.name })}
                </p>
              ) : outcome === "failed" || outcome === "limit" || full ? (
                <p role="alert" className="text-sm text-destructive">
                  {outcome === "failed"
                    ? t("security.passkeyFailed")
                    : t("security.passkeysLimit", { max })}
                </p>
              ) : null}
              <Button type="submit" disabled={busy || full}>
                <FingerprintIcon aria-hidden="true" />
                {waiting ? t("security.passkeyAdding") : t("security.passkeyAdd")}
              </Button>
            </fetcher.Form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("security.passkeysListHeading")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {passkeys.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("security.passkeysEmpty")}</p>
            ) : (
              <ul className="grid gap-4" aria-label={t("security.passkeysListHeading")}>
                {passkeys.map((passkey) => (
                  <li key={passkey.id} className="flex flex-wrap items-center gap-3">
                    <FingerprintIcon aria-hidden="true" className="size-5 text-muted-foreground" />
                    <div className="grid min-w-0 flex-1 text-sm">
                      <p className="truncate text-base font-medium">{passkey.name}</p>
                      <p className="text-muted-foreground">
                        {t("security.passkeyCreated", {
                          date: date.format(new Date(passkey.createdAt)),
                        })}
                      </p>
                      <p className="text-muted-foreground">
                        {passkey.lastUsedAt
                          ? t("security.passkeyLastUsed", {
                              date: date.format(new Date(passkey.lastUsedAt)),
                            })
                          : t("security.passkeyNeverUsed")}
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
        aria-label={t("security.passkeyRemoveLabel", { name })}
        disabled={fetcher.state !== "idle"}
      >
        {t("security.passkeyRemove")}
      </Button>
    </fetcher.Form>
  );
}
