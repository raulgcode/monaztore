import { getFormProps, type SubmissionResult, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { mfaCodeSchema } from "@monaztore/contracts";
import {
  browserSupportsWebAuthn,
  type PublicKeyCredentialRequestOptionsJSON,
  startAuthentication,
} from "@simplewebauthn/browser";
import { FingerprintIcon } from "lucide-react";
import type * as React from "react";
import { useState } from "react";
import {
  Form,
  Link,
  type ShouldRevalidateFunctionArgs,
  useLocation,
  useNavigation,
  useSubmit,
} from "react-router";
import { StandalonePage } from "~/components/standalone-page";
import { TextField } from "~/components/text-field";
import { Button } from "~/components/ui/button";
import { useT } from "~/lib/i18n";

// Once enrolled, the loader finds the session verified and redirects: revalidating after the
// enrollment would leave before the person saves the recovery codes. "Continue" goes back to it.
// A passkey that didn't work used up its challenge: the loader hands out a new one.
export function secondStepShouldRevalidate({
  actionResult,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (actionResult?.recoveryCodes) return false;
  return actionResult?.passkeyFailed ? true : defaultShouldRevalidate;
}

export interface SecondStepData {
  setup: { secret: string; qr: string } | null;
  passkey: unknown;
}

export interface SecondStepResult {
  result?: SubmissionResult<string[]> | null;
  recoveryCodes?: string[] | null;
  passkeyFailed?: boolean;
}

/**
 * The second sign-in step's page, the same for /admin and a store's team: the first visit sets
 * up the authenticator app (QR, first code, recovery codes); after that, today's code or one of
 * the person's passkeys (fingerprint, face, phone or security key).
 */
export function SecondStep({
  loaderData,
  actionData,
}: {
  loaderData: SecondStepData;
  actionData: SecondStepResult | undefined;
}) {
  const t = useT();
  const location = useLocation();
  const navigation = useNavigation();
  const [form, fields] = useForm({
    lastResult: actionData?.result ?? undefined,
    shouldValidate: "onSubmit",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: mfaCodeSchema }),
  });

  if (actionData?.recoveryCodes) {
    return (
      <Entrance heading={t("security.mfaRecoveryHeading")} intro={t("security.mfaRecoveryIntro")}>
        <ul
          aria-label={t("security.mfaRecoveryLabel")}
          className="grid grid-cols-2 gap-2 rounded-md border bg-muted p-4 font-mono text-base"
        >
          {actionData.recoveryCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        {/* Back through the loader, which now finds the session verified and moves on to
            `?redirectTo` (a bare "." would drop it). */}
        <Button asChild>
          <Link to={{ search: location.search }} replace>
            {t("security.mfaContinue")}
          </Link>
        </Button>
      </Entrance>
    );
  }

  const { setup, passkey } = loaderData;
  return (
    <Entrance
      heading={t(
        setup
          ? "security.mfaSetupHeading"
          : passkey
            ? "security.mfaPasskeyHeading"
            : "security.mfaVerifyHeading",
      )}
      intro={t(
        setup
          ? "security.mfaSetupIntro"
          : passkey
            ? "security.mfaPasskeyIntro"
            : "security.mfaVerifyIntro",
      )}
    >
      {passkey ? (
        <PasskeySignIn
          options={passkey}
          failed={Boolean(actionData && "passkeyFailed" in actionData)}
        />
      ) : null}
      {setup ? (
        <div className="grid justify-items-center gap-3">
          <div
            role="img"
            aria-label={t("security.mfaQrAlt")}
            className="w-48 [&_svg]:h-auto [&_svg]:w-full"
            // An SVG made on the server by `qrcode` from our own otpauth:// link.
            dangerouslySetInnerHTML={{ __html: setup.qr }}
          />
          <p className="text-center text-sm text-muted-foreground">
            {t("security.mfaSecretLabel")}{" "}
            <code data-testid="totp-secret" className="break-all font-mono text-foreground">
              {setup.secret}
            </code>
          </p>
        </div>
      ) : null}
      <Form method="post" className="grid gap-4" {...getFormProps(form)}>
        <TextField
          field={fields.code}
          label={t("security.mfaCodeLabel")}
          inputMode="numeric"
          autoComplete="one-time-code"
          // With a passkey the code is the plan B: no keyboard popping up over the button.
          autoFocus={!passkey}
        />
        <Button
          type="submit"
          variant={passkey ? "outline" : "default"}
          disabled={navigation.state === "submitting"}
        >
          {t(setup ? "security.mfaConfirm" : "security.mfaVerify")}
        </Button>
      </Form>
      {setup || passkey ? null : (
        <p className="text-sm text-muted-foreground">{t("security.mfaPasskeyTip")}</p>
      )}
    </Entrance>
  );
}

/**
 * The fast way in: one tap and the device asks for the fingerprint, face or key. The response
 * goes to the action, which lets the session in and moves on like a right code.
 */
function PasskeySignIn({ options, failed }: { options: unknown; failed: boolean }) {
  const t = useT();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [waiting, setWaiting] = useState(false);
  const [problem, setProblem] = useState<"failed" | "unsupported" | null>(null);
  const message = problem ?? (failed && !waiting ? "failed" : null);

  async function signIn() {
    if (!browserSupportsWebAuthn()) {
      setProblem("unsupported");
      return;
    }
    setProblem(null);
    setWaiting(true);
    try {
      // The loader's JSON loses the literal types ("public-key" turns into string): same object.
      const optionsJSON = options as PublicKeyCredentialRequestOptionsJSON;
      const response = await startAuthentication({ optionsJSON });
      await submit({ intent: "passkey", response: JSON.stringify(response) }, { method: "post" });
    } catch {
      // Canceled, timed out or no matching key on this device: the code is still there.
      setProblem("failed");
    } finally {
      setWaiting(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Button
        type="button"
        onClick={signIn}
        disabled={waiting || navigation.state === "submitting"}
      >
        <FingerprintIcon aria-hidden="true" />
        {waiting ? t("security.mfaPasskeyWaiting") : t("security.mfaPasskeyButton")}
      </Button>
      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {t(
            message === "unsupported"
              ? "security.mfaPasskeyUnsupported"
              : "security.mfaPasskeyFailed",
          )}
        </p>
      ) : null}
      <p className="flex items-center gap-3 text-sm text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
        {t("security.mfaPasskeyOr")}
      </p>
    </div>
  );
}

/** The second step's page: narrow, with "Sign out" for whoever isn't meant to be here. */
function Entrance({
  heading,
  intro,
  children,
}: {
  heading: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <StandalonePage signOut>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
          <p className="text-muted-foreground">{intro}</p>
        </div>
        {children}
      </div>
    </StandalonePage>
  );
}
