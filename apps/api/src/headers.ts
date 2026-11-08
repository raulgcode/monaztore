import type { FastifyRequest } from "fastify";

/** Fastify's headers, read like the Fetch API's (`clientAddress` takes either). */
export function headerReader(request: FastifyRequest): Pick<Headers, "get"> {
  return {
    get: (name) => {
      const value = request.headers[name.toLowerCase()];
      return (Array.isArray(value) ? value[0] : value) ?? null;
    },
  };
}
