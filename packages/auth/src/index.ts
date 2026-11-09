export {
  oauthProviderAuthServerMetadata,
  verifyOAuthQueryParams,
} from "@better-auth/oauth-provider";
export { APIError } from "better-auth/api";
/** Better Auth's password hash, for rows written outside it (a seed). */
export { hashPassword } from "better-auth/crypto";
export {
  AI_CONSENT_PAGE,
  type Auth,
  type AuthSession,
  type CreateAuthOptions,
  createAuth,
  defaultOrganizationId,
  disabledAdminPaths,
  disabledOAuthProviderPaths,
  disabledOrganizationPaths,
  type RateLimitStorage,
  SUPER_ADMIN_ROLE,
} from "./auth";
