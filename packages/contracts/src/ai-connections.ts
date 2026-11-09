import { z } from "zod/mini";

// AI assistants: the person connects Claude, ChatGPT or an editor to the API's MCP server
// (`${API_URL}/mcp`) with OAuth. The web signs them in, asks for their second step and their
// consent; the API answers each tool with the person's role in each store.

/** Where the MCP server lives on the API. */
export const MCP_PATH = "/mcp";

/** The MCP server's address for an API at `apiUrl`. */
export function mcpUrl(apiUrl: string): string {
  return new URL(MCP_PATH, apiUrl).toString();
}

/**
 * Tokens carry a prefix so secret scanners (GitHub's, for one) can spot a leaked one. The
 * database keeps the hash of what follows it.
 */
export const aiTokenPrefixes = { opaqueAccessToken: "mcp_at_", refreshToken: "mcp_rt_" } as const;

/**
 * What an assistant may ask for: `store`, what the person can do in their stores with their
 * role (each tool checks it like the workspace does); `offline_access` keeps it connected.
 */
export const aiConnectionScopes = ["store", "offline_access"] as const;
export type AiConnectionScope = (typeof aiConnectionScopes)[number];

/** The consent page's answer. */
export const aiConsentSchema = z.object({ intent: z.enum(["allow", "deny"]) });
export type AiConsentInput = z.infer<typeof aiConsentSchema>;
