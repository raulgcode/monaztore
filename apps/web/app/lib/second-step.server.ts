import { parseWithZod } from "@conform-to/zod/v4";
import { mfaCodeSchema } from "@monaztore/contracts";
import {
  confirmTotpEnrollment,
  type MfaActor,
  mfaState,
  passkeySignInOptions,
  pendingTotpEnrollment,
  verifyMfaCode,
  verifyPasskey,
} from "@monaztore/core";
import { project } from "@monaztore/env/project";
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { data, redirect } from "react-router";
import { passkeyResponseOf } from "~/lib/passkeys";
import { passkeyParty } from "~/lib/passkeys.server";
import { qrSvg } from "~/lib/qr.server";
import { withinRateLimits } from "~/lib/rate-limit.server";
import { safeRedirect } from "~/lib/safe-redirect";
import { secrets } from "~/lib/services.server";

/** Who passes the step, in which session, how often, and where they go after it. */
export interface SecondStepOptions {
  actor: MfaActor;
  sessionId: string;
  email: string;
  ttlMs: number;
  /** Where to go without a `?redirectTo=`. */
  fallback: string;
}

const destination = (request: Request, fallback: string) =>
  safeRedirect(new URL(request.url).searchParams.get("redirectTo"), fallback);

/** What the page shows: the QR to set the app up, or the code and the passkey button. */
export async function secondStepLoader(request: Request, options: SecondStepOptions) {
  const { actor, sessionId, email, ttlMs, fallback } = options;
  const state = await mfaState(actor, sessionId, ttlMs);
  if (state === "verified") throw redirect(destination(request, fallback));
  if (state === "verify") {
    const passkey = await passkeySignInOptions(actor, passkeyParty, { sessionId });
    return { mode: state, setup: null, passkey };
  }
  const { secret, uri } = await pendingTotpEnrollment(actor, secrets.mfa, {
    account: email,
    issuer: project.name,
  });
  return { mode: state, setup: { secret, qr: await qrSvg(uri) }, passkey: null };
}

/** The first code (recovery codes come back), today's code, a recovery code or a passkey. */
export async function secondStepAction(request: Request, options: SecondStepOptions) {
  const { actor, sessionId, ttlMs, fallback } = options;
  const formData = await request.formData();
  // Six digits are a million guesses: a handful of tries per quarter hour keeps it that way.
  // Passkeys share the limit, so neither path gets a fresh set of tries from the other.
  const withinLimit = () => withinRateLimits([["mfaCode", actor.userId]]);

  if (formData.get("intent") === "passkey") {
    const response = passkeyResponseOf<AuthenticationResponseJSON>(formData.get("response"));
    if (
      response &&
      (await withinLimit()) &&
      (await mfaState(actor, sessionId, ttlMs)) === "verify" &&
      (await verifyPasskey(actor, passkeyParty, { sessionId, response }))
    ) {
      throw redirect(destination(request, fallback));
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
  const attempt = { code: submission.value.code, sessionId };
  const state = await mfaState(actor, sessionId, ttlMs);
  if (state === "enroll") {
    const recoveryCodes = await confirmTotpEnrollment(actor, secrets.mfa, attempt);
    if (recoveryCodes) return { result: submission.reply({ resetForm: true }), recoveryCodes };
  } else if (await verifyMfaCode(actor, secrets.mfa, attempt)) {
    throw redirect(destination(request, fallback));
  }
  return data(
    {
      result: submission.reply({ fieldErrors: { code: ["forms.mfaCodeInvalid"] } }),
      recoveryCodes: null,
    },
    { status: 400 },
  );
}
