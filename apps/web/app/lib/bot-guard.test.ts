import { describe, expect, it, vi } from "vitest";
import { botSignal, formStamp, verifyTurnstile } from "./bot-guard.server";

const secret = "test-secret";
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

describe("botSignal", () => {
  const shown = 1_000_000;
  const stamp = formStamp(secret, shown);

  it("takes a form a person filled in a few seconds", () => {
    expect(botSignal(form({ stamp }), { secret, minFillMs: 3000, now: shown + 8000 })).toBeNull();
  });

  it("drops a form whose hidden field was filled", () => {
    expect(
      botSignal(form({ stamp, website: "https://spam.example" }), {
        secret,
        minFillMs: 3000,
        now: shown + 8000,
      }),
    ).toBe("honeypot");
  });

  it("drops one sent the instant the page loaded", () => {
    expect(botSignal(form({ stamp }), { secret, minFillMs: 3000, now: shown + 500 })).toBe(
      "too_fast",
    );
  });

  it("drops one without the page's signed time, or with a time made up", () => {
    expect(botSignal(form({}), { secret, minFillMs: 0 })).toBe("no_stamp");
    expect(botSignal(form({ stamp: `${shown - 60_000}.forged` }), { secret, minFillMs: 0 })).toBe(
      "no_stamp",
    );
    expect(
      botSignal(form({ stamp: formStamp("another-secret", shown) }), { secret, minFillMs: 0 }),
    ).toBe("no_stamp");
  });

  it("drops a page replayed after a day", () => {
    expect(
      botSignal(form({ stamp }), { secret, minFillMs: 0, now: shown + 25 * 60 * 60 * 1000 }),
    ).toBe("stale");
  });
});

describe("verifyTurnstile", () => {
  it("asks Cloudflare and believes only a success", async () => {
    const yes = vi.fn(async () => Response.json({ success: true }));
    const no = vi.fn(async () => Response.json({ success: false }));
    expect(await verifyTurnstile("k", "token", "203.0.113.7", yes)).toBe(true);
    expect(await verifyTurnstile("k", "token", "203.0.113.7", no)).toBe(false);
    expect(await verifyTurnstile("k", "", "203.0.113.7", yes)).toBe(false);
    const body = yes.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(body[1].body)).toContain("remoteip=203.0.113.7");
  });

  it("says no when Cloudflare can't be reached", async () => {
    const down = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await verifyTurnstile("k", "token", "203.0.113.7", down)).toBe(false);
  });
});
