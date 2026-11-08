import { parseWithZod } from "@conform-to/zod/v4";
import { APIError } from "@monaztore/auth";
import { magicLinkSchema, passwordSignInSchema } from "@monaztore/contracts";
import type { AuthMethod } from "@monaztore/env";
import { data, href, type RouterContextProvider, redirect } from "react-router";
import { localeOf } from "~/lib/locale.server";
import { requestAddress, withinRateLimits } from "~/lib/rate-limit.server";
import { safeRedirect } from "~/lib/safe-redirect";
import { auth, authMethods } from "~/lib/services.server";

/** Which email form /login shows: `?with=link` or `?with=password`, else the first one on. */
export type EmailMode = "password" | "magic-link" | null;

export function emailModeOf(url: URL, methods: readonly AuthMethod[] = authMethods): EmailMode {
  const asked = url.searchParams.get("with");
  if (asked === "link" && methods.includes("magic-link")) return "magic-link";
  if (asked === "password" && methods.includes("password")) return "password";
  if (methods.includes("password")) return "password";
  return methods.includes("magic-link") ? "magic-link" : null;
}

/** 404 unless the method is on: its pages and actions don't exist for this project. */
export function requireMethod(method: AuthMethod): void {
  if (!authMethods.includes(method)) throw data("Page not found", { status: 404 });
}

export type SignInFailure = "invalid" | "unverified" | null;

interface ActionArgs {
  request: Request;
  url: URL;
  context: Readonly<RouterContextProvider>;
}

/**
 * The action of /login: "Continue with Google", a magic link or the password, by `intent`. Each
 * one lands on `?redirectTo` (or /app).
 */
export async function signInAction({ request, url, context }: ActionArgs) {
  const formData = await request.formData();
  // `url`, not `request.url`: the form posts to `/login.data`, and the email link must not.
  const redirectTo = safeRedirect(url.searchParams.get("redirectTo"), href("/app"));
  const intent = formData.get("intent");

  if (intent === "google") {
    requireMethod("google");
    // Better Auth stores the OAuth state in a cookie, so its Set-Cookie must travel with the redirect.
    const { headers, response } = await auth.api.signInSocial({
      body: {
        provider: "google",
        callbackURL: redirectTo,
        errorCallbackURL: url.pathname,
        disableRedirect: true,
      },
      headers: request.headers,
      returnHeaders: true,
    });
    if (!response.url) throw new Error("Google sign-in did not return an authorization URL");
    throw redirect(response.url, { headers });
  }

  if (intent === "password") {
    requireMethod("password");
    const submission = parseWithZod(formData, { schema: passwordSignInSchema });
    const reply = (failure: SignInFailure = null, status = 400, tooMany = false) =>
      data(
        {
          result: submission.reply({
            hideFields: ["password"],
            fieldErrors: tooMany ? { email: ["forms.tooManyAttempts"] } : undefined,
          }),
          failure,
          sentTo: null,
          email: submission.status === "success" ? submission.value.email : null,
        },
        { status },
      );
    if (submission.status !== "success") return reply();
    // Better Auth's own limiter only counts HTTP calls; this goes through its server API.
    const allowed = await withinRateLimits([
      ["passwordIp", requestAddress(request)],
      ["passwordEmail", submission.value.email],
    ]);
    if (!allowed) return reply(null, 429, true);
    try {
      const { headers } = await auth.api.signInEmail({
        // An unverified email gets the link again (sendOnSignIn), back to where they were going.
        body: { ...submission.value, callbackURL: redirectTo },
        headers: request.headers,
        returnHeaders: true,
      });
      return redirect(redirectTo, { headers });
    } catch (error) {
      if (!(error instanceof APIError)) throw error;
      return reply(error.status === "FORBIDDEN" ? "unverified" : "invalid");
    }
  }

  requireMethod("magic-link");
  const submission = parseWithZod(formData, { schema: magicLinkSchema });
  if (submission.status !== "success") {
    return data(
      { result: submission.reply(), failure: null, sentTo: null, email: null },
      { status: 400 },
    );
  }
  // Each try sends an email: a script could flood an inbox or our sending reputation.
  const allowed = await withinRateLimits([
    ["signInIp", requestAddress(request)],
    ["signInEmail", submission.value.email],
  ]);
  if (!allowed) {
    return data(
      {
        result: submission.reply({ fieldErrors: { email: ["forms.tooManyAttempts"] } }),
        failure: null,
        sentTo: null,
        email: null,
      },
      { status: 429 },
    );
  }
  await auth.api.signInMagicLink({
    // The email goes out in the page's language (`sendMagicLink` in @monaztore/auth).
    body: {
      email: submission.value.email,
      callbackURL: redirectTo,
      errorCallbackURL: url.pathname,
      metadata: { locale: localeOf(context) },
    },
    headers: request.headers,
  });
  return data({
    result: submission.reply({ resetForm: true }),
    failure: null,
    sentTo: submission.value.email,
    email: null,
  });
}
