import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { aiConnectionScopes, MCP_PATH, mcpUrl } from "@monaztore/contracts";
import { authenticateAiToken, hitRateLimit } from "@monaztore/core";
import type { Mailer } from "@monaztore/email";
import { project } from "@monaztore/env/project";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { createMcpServer } from "../mcp/server";

export interface McpRoutesOptions {
  /** This API (API_URL): the MCP server is `${apiUrl}/mcp`. */
  apiUrl: string;
  /** The web, which signs the person in: its Better Auth is the authorization server. */
  appUrl: string;
  mailer?: Mailer;
  /** Calls one person may make per minute, across their assistants. */
  rateLimit?: number;
}

const RATE_WINDOW_MS = 60_000;
const METADATA_PATH = "/.well-known/oauth-protected-resource";

/**
 * The stores' MCP server, at POST /mcp (Streamable HTTP, stateless: any machine answers any
 * call). Claude, ChatGPT and the editors connect with OAuth: a call without a valid token gets a
 * 401 pointing at this resource's metadata, which names the web as the place to sign in.
 */
export const mcpRoutes: FastifyPluginAsync<McpRoutesOptions> = async (
  app,
  { apiUrl, appUrl, mailer, rateLimit = 60 },
) => {
  const resource = mcpUrl(apiUrl);
  const resourceMetadata = new URL(`${METADATA_PATH}${MCP_PATH}`, apiUrl).toString();
  // RFC 9728: the resource, and where its tokens come from.
  const metadata = {
    resource,
    authorization_servers: [new URL("/api/auth", appUrl).toString()],
    scopes_supported: [...aiConnectionScopes],
    bearer_methods_supported: ["header"],
    resource_name: project.name,
  };
  app.get(METADATA_PATH, { schema: { hide: true } }, () => metadata);
  app.get(`${METADATA_PATH}${MCP_PATH}`, { schema: { hide: true } }, () => metadata);

  const unauthorized = (reply: FastifyReply, invalid: boolean) =>
    reply
      .code(401)
      .header(
        "WWW-Authenticate",
        `Bearer resource_metadata="${resourceMetadata}"${invalid ? ', error="invalid_token"' : ""}`,
      )
      .send({ error: "unauthorized", message: `Connect from ${project.name}` });

  async function handle(request: FastifyRequest, reply: FastifyReply) {
    const [scheme, token] = (request.headers.authorization ?? "").split(" ");
    if (scheme !== "Bearer" || !token) return unauthorized(reply, false);
    const caller = await authenticateAiToken(app.db, token);
    if (!caller) return unauthorized(reply, true);

    // Counted in Postgres, so the limit holds however many machines serve the API.
    const calls = await hitRateLimit(app.db, `mcp:user:${caller.userId}`, {
      limit: rateLimit,
      windowMs: RATE_WINDOW_MS,
    });
    if (!calls.allowed) {
      return reply
        .code(429)
        .header("Retry-After", String(calls.retryAfterSeconds))
        .send({ error: "rate_limited", message: `Up to ${rateLimit} calls a minute` });
    }

    // A server per call: nothing is kept between calls, so no session ties a client to a machine.
    const server = createMcpServer(caller, { appUrl, mailer });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (typeof value === "string") headers.set(name, value);
    }
    const response = await transport.handleRequest(
      new Request(resource, { method: request.method, headers }),
      { parsedBody: request.body },
    );
    reply.code(response.status);
    response.headers.forEach((value, name) => {
      reply.header(name, value);
    });
    const body = await response.text();
    await server.close();
    return reply.send(body);
  }

  app.post(MCP_PATH, { schema: { hide: true } }, handle);
  // Stateless: there is no stream to open (GET) nor a session to end (DELETE).
  app.get(MCP_PATH, { schema: { hide: true } }, (_request, reply) =>
    reply.code(405).header("Allow", "POST").send({ error: "method_not_allowed" }),
  );
  app.delete(MCP_PATH, { schema: { hide: true } }, (_request, reply) =>
    reply.code(405).header("Allow", "POST").send({ error: "method_not_allowed" }),
  );
};
