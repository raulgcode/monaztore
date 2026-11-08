import { isIP } from "node:net";
import { type Database, lt, schema, sql } from "@monaztore/db";

/** At most `limit` calls per `windowMs`, counted from the first call of the window. */
export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window ends; 0 when the call was allowed. */
  retryAfterSeconds: number;
}

/**
 * Counts one call for `key` (e.g. `login:ip:203.0.113.7`) and says whether it fits the rule.
 * One upsert in Postgres, so concurrent calls and several servers share the same count.
 */
export async function hitRateLimit(
  db: Database,
  key: string,
  { limit, windowMs }: RateLimitRule,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const { windowStart, count } = schema.rateLimit;
  const expired = sql`${windowStart} <= ${new Date(now.getTime() - windowMs)}`;
  const [row] = await db
    .insert(schema.rateLimit)
    .values({ key, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: schema.rateLimit.key,
      set: {
        count: sql`case when ${expired} then 1 else ${count} + 1 end`,
        windowStart: sql`case when ${expired} then excluded.window_start else ${windowStart} end`,
      },
    })
    .returning({ windowStart, count });
  if (!row) throw new Error("Rate limit upsert returned no rows");
  if (row.count <= limit) return { allowed: true, retryAfterSeconds: 0 };
  const endsAt = row.windowStart.getTime() + windowMs;
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((endsAt - now.getTime()) / 1000)),
  };
}

/** No rule is longer than a day, so older windows can go. The API's hourly job calls this. */
export async function pruneRateLimits(db: Database, now: Date = new Date()): Promise<void> {
  await db
    .delete(schema.rateLimit)
    .where(lt(schema.rateLimit.windowStart, new Date(now.getTime() - 24 * 60 * 60 * 1000)));
}

/**
 * The caller's IP, from the header the platform's proxy sets (`Fly-Client-IP` on Fly.io, which
 * the proxy overwrites, so a client can't fake it). Anything else counts as "unknown".
 */
export function clientAddress(headers: Pick<Headers, "get">, header: string): string {
  const value = headers.get(header)?.split(",")[0]?.trim() ?? "";
  return isIP(value) ? value : "unknown";
}
