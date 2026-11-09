import { oauthProviderAuthServerMetadata } from "@monaztore/auth";
import { auth } from "~/lib/services.server";
import type { Route } from "./+types/authorization-server";

const metadata = oauthProviderAuthServerMetadata(auth);

/**
 * AI assistants: where an assistant finds how to sign the person in (RFC 8414). Better Auth's
 * issuer is `${APP_URL}/api/auth`, so the document lives at
 * /.well-known/oauth-authorization-server/api/auth; the bare path answers the same for clients
 * that skip the issuer's path.
 */
export function loader({ request }: Route.LoaderArgs) {
  return metadata(request);
}
