import { type AuthMethod, authMethods } from "@monaztore/env";

/** How each way to sign in reads in the setup's question, in the order the login shows them. */
export const authMethodLabels: Record<AuthMethod, string> = {
  "magic-link": "Email link (magic link), no password",
  password: "Email and password (with email confirmation and recovery)",
  google: "Google (needs an OAuth client from Google Cloud)",
};

/**
 * The answer to "How do people sign in?": numbers of the list (`1,3`), names (`password,google`)
 * or Enter for `fallback`. Undefined when something in it isn't a way to sign in.
 */
export function parseAuthChoice(
  answer: string,
  fallback: readonly AuthMethod[],
): AuthMethod[] | undefined {
  const parts = answer
    .split(/[\s,]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) return [...fallback];
  const picked = new Set<AuthMethod>();
  for (const part of parts) {
    const byNumber = authMethods[Number(part) - 1];
    const byName = authMethods.find((method) => method === part);
    const method = /^\d+$/.test(part) ? byNumber : byName;
    if (!method) return undefined;
    picked.add(method);
  }
  // Always in the list's order, so AUTH_METHODS reads the same however it was typed.
  return authMethods.filter((method) => picked.has(method));
}
