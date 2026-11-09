import { verifyOAuthQueryParams } from "@monaztore/auth";
import { env } from "./services.server";

/** What Better Auth adds when it signs an authorization request it sends to /login or consent. */
const signingParams = ["sig", "exp", "ba_iat", "ba_pl", "ba_param"];

/**
 * An assistant (Claude, ChatGPT…) asking to connect sends the person to /login with its signed
 * authorization request. This is that request again, to resume it once they sign in: the email
 * link, the password or Google come back to it, Better Auth finds the session and goes on to
 * the consent page. Null when the query isn't a valid, current request of ours.
 */
export async function authorizeContinuation(url: URL): Promise<string | null> {
  const query = url.searchParams;
  if (!query.has("sig") || !query.has("client_id")) return null;
  if (!(await verifyOAuthQueryParams(query.toString(), env.BETTER_AUTH_SECRET))) return null;
  const authorize = new URLSearchParams(query);
  for (const name of signingParams) authorize.delete(name);
  // `prompt=login` sends the person to /login again, and they just signed in.
  const prompt = authorize
    .get("prompt")
    ?.split(" ")
    .filter((value) => value !== "login")
    .join(" ");
  if (prompt) authorize.set("prompt", prompt);
  else authorize.delete("prompt");
  return `/api/auth/oauth2/authorize?${authorize}`;
}

/** Whether a consent page's query is the signed request Better Auth sent, still in time. */
export function isSignedConsentQuery(url: URL): Promise<boolean> {
  return verifyOAuthQueryParams(url.searchParams.toString(), env.BETTER_AUTH_SECRET);
}
