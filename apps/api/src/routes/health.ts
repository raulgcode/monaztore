import { sql } from "@monaztore/db";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/health",
    {
      schema: {
        response: { 200: z.object({ status: z.literal("ok"), database: z.literal("ok") }) },
      },
    },
    async () => {
      await app.db.execute(sql`select 1`);
      return { status: "ok" as const, database: "ok" as const };
    },
  );
};
