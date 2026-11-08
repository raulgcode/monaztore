import { pruneRateLimits } from "@monaztore/core";
import type { Database } from "@monaztore/db";
import type { FastifyBaseLogger } from "fastify";

/** Every hour: forgets the rate-limit windows that ended long ago, so the table stays small. */
export function scheduleRateLimitCleanup(
  { db, log }: { db: Database; log: FastifyBaseLogger },
  everyMs = 60 * 60 * 1000,
) {
  const run = () =>
    pruneRateLimits(db).catch((error: unknown) =>
      log.error({ err: error }, "Rate limit cleanup failed"),
    );
  void run();
  const timer = setInterval(run, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
