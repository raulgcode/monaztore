import { parseWithZod } from "@conform-to/zod/v4";
import { passkeyNameSchema } from "@monaztore/contracts";
import {
  addPasskey,
  DomainError,
  listPasskeys,
  type MfaActor,
  PASSKEYS_MAX,
  passkeyRegistrationOptions,
  removePasskey,
} from "@monaztore/core";
import type { RegistrationResponseJSON } from "@simplewebauthn/browser";
import { data, type RouterContextProvider } from "react-router";
import { serverT } from "~/lib/locale.server";
import { deviceNameOf, passkeyResponseOf } from "~/lib/passkeys";
import { passkeyParty } from "~/lib/passkeys.server";

/** Whose passkeys the page manages: the signed-in person's, in this session. */
export interface PasskeysPageOptions {
  actor: MfaActor;
  sessionId: string;
  email: string;
}

/**
 * Someone's passkeys: fingerprint, face, the phone or a security key, to pass the second step
 * without typing the authenticator code. Each person sees only their own.
 */
export async function passkeysLoader(
  request: Request,
  context: Readonly<RouterContextProvider>,
  { actor, sessionId, email }: PasskeysPageOptions,
) {
  const [passkeys, options] = await Promise.all([
    listPasskeys(actor),
    passkeyRegistrationOptions(actor, passkeyParty, { sessionId, userName: email }),
  ]);
  return {
    passkeys,
    options,
    // From the loader: importing it from core would ship core to the browser.
    max: PASSKEYS_MAX,
    defaultName:
      deviceNameOf(request.headers.get("User-Agent") ?? "") ??
      serverT(context)("security.passkeyDefaultName"),
  };
}

export async function passkeysAction(request: Request, { actor, sessionId }: PasskeysPageOptions) {
  const formData = await request.formData();

  if (formData.get("intent") === "remove") {
    await removePasskey(actor, String(formData.get("id")));
    return { result: null, outcome: "removed" as const, name: null };
  }

  const submission = parseWithZod(formData, { schema: passkeyNameSchema });
  if (submission.status !== "success") {
    return data({ result: submission.reply(), outcome: null, name: null }, { status: 400 });
  }
  const response = passkeyResponseOf<RegistrationResponseJSON>(formData.get("response"));
  try {
    const passkey = response
      ? await addPasskey(actor, passkeyParty, { sessionId, name: submission.value.name, response })
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

export type PasskeysLoaderData = Awaited<ReturnType<typeof passkeysLoader>>;
export type PasskeysActionData = Awaited<ReturnType<typeof passkeysAction>>;
