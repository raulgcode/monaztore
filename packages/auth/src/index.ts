export { APIError } from "better-auth/api";
/** Better Auth's password hash, for rows written outside it (a seed). */
export { hashPassword } from "better-auth/crypto";
export {
  type Auth,
  type AuthSession,
  type CreateAuthOptions,
  createAuth,
  defaultOrganizationId,
  disabledOrganizationPaths,
  type RateLimitStorage,
} from "./auth";
