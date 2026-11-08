import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import * as z from "zod";

/**
 * Local development only: signs in as any user, without an email, from the /dev/sign-in page.
 * The endpoint is server-only (Better Auth never puts it on /api/auth/*), and unless
 * `createAuth({ devSignIn: true })` it refuses every call. The web app only turns it on in
 * `pnpm dev`, so a production build cannot sign anyone in with it.
 */
export function devSignIn(enabled: boolean) {
  return {
    id: "monaztore-dev-sign-in",
    endpoints: {
      devSignIn: createAuthEndpoint.serverOnly(
        { method: "POST", body: z.object({ userId: z.string() }) },
        async (ctx) => {
          if (!enabled) throw new APIError("NOT_FOUND");
          const user = await ctx.context.internalAdapter.findUserById(ctx.body.userId);
          if (!user) throw new APIError("NOT_FOUND", { message: "User not found" });
          const session = await ctx.context.internalAdapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ userId: user.id });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
