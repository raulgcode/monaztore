import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import { DomainError, NotFoundError } from "@monaztore/core";
import type { Database } from "@monaztore/db";
import type { Mailer } from "@monaztore/email";
import { project } from "@monaztore/env/project";
import Fastify, { type FastifyServerOptions } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { healthRoutes } from "./routes/health";
import { mcpRoutes } from "./routes/mcp";

export interface BuildAppOptions {
  db: Database;
  appUrl: string;
  /** This API's own address (API_URL), the MCP server's resource. Without it, no /mcp. */
  apiUrl?: string;
  /** Emails a tool sends (a paid order's downloads link). */
  mailer?: Mailer;
  /** The header with the caller's IP, set by the platform's proxy (Fly-Client-IP on Fly.io). */
  clientIpHeader?: string;
  logger?: FastifyServerOptions["logger"];
}

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
    clientIpHeader: string;
  }
}

/**
 * The API: Zod validates every request and response and documents it in /openapi.json. Each
 * feature is a plugin in `routes/` that calls the use cases of @monaztore/core, like the web does.
 */
export async function buildApp({
  db,
  appUrl,
  apiUrl,
  mailer,
  clientIpHeader = "fly-client-ip",
  logger = false,
}: BuildAppOptions) {
  const app = Fastify({ logger }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate("db", db);
  app.decorate("clientIpHeader", clientIpHeader);

  await app.register(helmet);
  await app.register(cors, { origin: [appUrl] });
  await app.register(sensible);
  await app.register(swagger, {
    openapi: { info: { title: `${project.name} API`, version: "1.0.0" } },
    transform: jsonSchemaTransform,
  });

  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.code(400).send({ error: "validation_error", issues: error.validation });
    }
    if (error instanceof NotFoundError) {
      return reply.code(404).send({ error: "not_found", message: error.message });
    }
    if (error instanceof DomainError) {
      return reply.code(409).send({ error: error.code, message: error.message });
    }
    request.log.error(error);
    return reply.code(500).send({ error: "internal_error" });
  });

  app.get("/openapi.json", { schema: { hide: true } }, () => app.swagger());
  await app.register(healthRoutes);
  // AI assistants (Claude, ChatGPT, the editors): the stores' tools, with the person's OAuth token.
  if (apiUrl) await app.register(mcpRoutes, { apiUrl, appUrl, mailer });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
