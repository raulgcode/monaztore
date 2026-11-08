import { randomUUID } from "node:crypto";
import { eq, schema } from "@monaztore/db";
import { createTestDatabase } from "@monaztore/db/testing";
import { afterAll, describe, expect, it } from "vitest";
import { hitRateLimit, pruneRateLimits } from "./rate-limits";

const connection = createTestDatabase();
afterAll(() => connection.close());
const db = connection.db;

const rule = { limit: 3, windowMs: 60_000 };
const at = (seconds: number) => new Date(Date.UTC(2026, 9, 1, 12, 0, seconds));

describe("hitRateLimit", () => {
  it("lets the first calls through and stops the one over the limit", async () => {
    const key = `test:${randomUUID()}`;

    const results = [];
    for (const second of [0, 1, 2, 3]) results.push(await hitRateLimit(db, key, rule, at(second)));

    expect(results.map((result) => result.allowed)).toEqual([true, true, true, false]);
    expect(results[3]).toEqual({ allowed: false, retryAfterSeconds: 57 });
  });

  it("starts over when the window has passed", async () => {
    const key = `test:${randomUUID()}`;
    for (const second of [0, 1, 2, 3]) await hitRateLimit(db, key, rule, at(second));

    expect(await hitRateLimit(db, key, rule, at(60))).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  it("counts each key on its own", async () => {
    const [first, second] = [`test:${randomUUID()}`, `test:${randomUUID()}`];
    for (const s of [0, 1, 2, 3]) await hitRateLimit(db, first, rule, at(s));

    expect((await hitRateLimit(db, second, rule, at(4))).allowed).toBe(true);
  });

  it("holds the limit when the calls arrive at the same time", async () => {
    const key = `test:${randomUUID()}`;

    const results = await Promise.all(
      Array.from({ length: 10 }, () => hitRateLimit(db, key, rule, at(0))),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(3);
  });
});

describe("pruneRateLimits", () => {
  it("forgets windows that ended long ago and keeps the current ones", async () => {
    const [old, current] = [`test:${randomUUID()}`, `test:${randomUUID()}`];
    await hitRateLimit(db, old, rule, new Date("2020-01-01T00:00:00Z"));
    await hitRateLimit(db, current, rule);

    await pruneRateLimits(db);

    const keys = async (key: string) =>
      db.select().from(schema.rateLimit).where(eq(schema.rateLimit.key, key));
    expect(await keys(old)).toEqual([]);
    expect(await keys(current)).toHaveLength(1);
  });
});
