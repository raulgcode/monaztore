import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { mfaCodeSchema } from "@monaztore/contracts";
import {
  ADMIN_MFA_TTL_MS,
  confirmTotpEnrollment,
  mfaState,
  passkeySignInOptions,
  pendingTotpEnrollment,
  verifyMfaCode,
  verifyPasskey,
} from "@monaztore/core";
import { project } from "@monaztore/env/project";
import {
  type AuthenticationResponseJSON,
  browserSupportsWebAuthn,
  type PublicKeyCredentialRequestOptionsJSON,
  startAuthentication,
} from "@simplewebauthn/browser";
import { FingerprintIcon } from "lucide-react";
import type * as React from "react";
import { useState } from "react";
import {
  data,
  Form,
  href,
  Link,
  redirect,
  type ShouldRevalidateFunctionArgs,
  useNavigation,
  useSubmit,
} from "react-router";
import { StandalonePage } from "~/components/standalone-page";
import { TextField } from "~/components/text-field";
import { Button } from "~/components/ui/button";
import { sessionContext, superAdminContext } from "~/context";
import { metaT, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { passkeyResponseOf } from "~/lib/passkeys";
import { passkeyParty } from "~/lib/passkeys.server";
import { qrSvg } from "~/lib/qr.server";
import { withinRateLimits } from "~/lib/rate-limit.server";
import { safeRedirect } from "~/lib/safe-redirect";
import { secrets } from "~/lib/services.server";
import { requireSuperAdminIdentity } from "~/middleware/admin.server";
import type { Route } from "./+types/mfa";

export const middleware: Route.MiddlewareFunction[] = [requireSuperAdminIdentity];

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("admin.mfaTitle") }, { name: "robots", content: "noindex" }];
}

// Once enrolled, the loader finds the session verified and redirects: revalidating after the
// enrollment would leave before the admin saves the recovery codes. "Continue" goes back to it.
// A passkey that didn't work used up its challenge: the loader hands out a new one.
export function shouldRevalidate({
  actionResult,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (actionResult?.recoveryCodes) return false;
  return actionResult?.passkeyFailed ? true : defaultShouldRevalidate;
}

const destination = (request: Request) =>
  safeRedirect(new URL(request.url).searchParams.get("redirectTo"), href("/admin"));

/**
 * The second step of /admin: the first visit sets up the authenticator app (QR, first code,
 * recovery codes); after that, every new session or after 12 hours, today's code or one of
 * the admin's passkeys (fingerprint, face, phone or security key).
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const admin = context.get(superAdminContext);
  const { session, user } = context.get(sessionContext);
  const state = await mfaState(admin, session.id, ADMIN_MFA_TTL_MS);
  if (state === "verified") throw redirect(destination(request));
  const i18n = translations(context, "admin", "forms");
  if (state === "verify") {
    const passkey = await passkeySignInOptions(admin, passkeyParty, { sessionId: session.id });
    return { mode: state, setup: null, passkey, i18n };
  }
  const { secret, uri } = await pendingTotpEnrollment(admin, secrets.mfa, {
    account: user.email,
    issuer: project.name,
  });
  return { mode: state, setup: { secret, qr: await qrSvg(uri) }, passkey: null, i18n };
}

export async function action({ request, context }: Route.ActionArgs) {
  const admin = context.get(superAdminContext);
  const { session } = context.get(sessionContext);
  const formData = await request.formData();
  // Six digits are a million guesses: a handful of tries per quarter hour keeps it that way.
  // Passkeys share the limit, so neither path gets a fresh set of tries from the other.
  const withinLimit = () => withinRateLimits([["mfaCode", admin.userId]]);

  if (formData.get("intent") === "passkey") {
    const response = passkeyResponseOf<AuthenticationResponseJSON>(formData.get("response"));
    if (
      response &&
      (await withinLimit()) &&
      (await mfaState(admin, session.id, ADMIN_MFA_TTL_MS)) === "verify" &&
      (await verifyPasskey(admin, passkeyParty, { sessionId: session.id, response }))
    ) {
      throw redirect(destination(request));
    }
    return data({ result: null, recoveryCodes: null, passkeyFailed: true }, { status: 400 });
  }

  const submission = parseWithZod(formData, { schema: mfaCodeSchema });
  if (submission.status !== "success") {
    return data({ result: submission.reply(), recoveryCodes: null }, { status: 400 });
  }
  if (!(await withinLimit())) {
    return data(
      {
        result: submission.reply({ fieldErrors: { code: ["forms.tooManyAttempts"] } }),
        recoveryCodes: null,
      },
      { status: 429 },
    );
  }
  const attempt = { code: submission.value.code, sessionId: session.id };
  const state = await mfaState(admin, session.id, ADMIN_MFA_TTL_MS);
  if (state === "enroll") {
    const recoveryCodes = await confirmTotpEnrollment(admin, secrets.mfa, attempt);
    if (recoveryCodes) return { result: submission.reply({ resetForm: true }), recoveryCodes };
  } else if (await verifyMfaCode(admin, secrets.mfa, attempt)) {
    throw redirect(destination(request));
  }
  return data(
    {
      result: submission.reply({ fieldErrors: { code: ["forms.mfaCodeInvalid"] } }),
      recoveryCodes: null,
    },
    { status: 400 },
  );
}

export default function AdminMfa({ loaderData, actionData }: Route.ComponentProps) {
  const t = useT();
  const navigation = useNavigation();
  const [form, fields] = useForm({
    lastResult: actionData?.result ?? undefined,
    shouldValidate: "onSubmit",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: mfaCodeSchema }),
  });

  if (actionData?.recoveryCodes) {
    return (
      <Entrance heading={t("admin.mfaRecoveryHeading")} intro={t("admin.mfaRecoveryIntro")}>
        <ul
          aria-label={t("admin.mfaRecoveryLabel")}
          className="grid grid-cols-2 gap-2 rounded-md border bg-muted p-4 font-mono text-base"
        >
          {actionData.recoveryCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        {/* Back through the loader, which now finds the session verified and moves on. */}
        <Button asChild>
          <Link to="." replace>
            {t("admin.mfaContinue")}
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
          ? "admin.mfaSetupHeading"
          : passkey
            ? "admin.mfaPasskeyHeading"
            : "admin.mfaVerifyHeading",
      )}
      intro={t(
        setup ? "admin.mfaSetupIntro" : passkey ? "admin.mfaPasskeyIntro" : "admin.mfaVerifyIntro",
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
            aria-label={t("admin.mfaQrAlt")}
            className="w-48 [&_svg]:h-auto [&_svg]:w-full"
            // An SVG made on the server by `qrcode` from our own otpauth:// link.
            dangerouslySetInnerHTML={{ __html: setup.qr }}
          />
          <p className="text-center text-sm text-muted-foreground">
            {t("admin.mfaSecretLabel")}{" "}
            <code data-testid="totp-secret" className="break-all font-mono text-foreground">
              {setup.secret}
            </code>
          </p>
        </div>
      ) : null}
      <Form method="post" className="grid gap-4" {...getFormProps(form)}>
        <TextField
          field={fields.code}
          label={t("admin.mfaCodeLabel")}
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
          {t(setup ? "admin.mfaConfirm" : "admin.mfaVerify")}
        </Button>
      </Form>
      {setup || passkey ? null : (
        <p className="text-sm text-muted-foreground">{t("admin.mfaPasskeyTip")}</p>
      )}
    </Entrance>
  );
}

/**
 * The fast way in: one tap and the device asks for the fingerprint, face or key. The response
 * goes to the action, which lets the session in and moves on like a right code.
 */
function PasskeySignIn({
  options,
  failed,
}: {
  options: NonNullable<Route.ComponentProps["loaderData"]["passkey"]>;
  failed: boolean;
}) {
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
        {waiting ? t("admin.mfaPasskeyWaiting") : t("admin.mfaPasskeyButton")}
      </Button>
      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {t(message === "unsupported" ? "admin.mfaPasskeyUnsupported" : "admin.mfaPasskeyFailed")}
        </p>
      ) : null}
      <p className="flex items-center gap-3 text-sm text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
        {t("admin.mfaPasskeyOr")}
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
