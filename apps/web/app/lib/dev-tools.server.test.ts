import { describe, expect, it, vi } from "vitest";
import { isLocalRequest, requireDevTools } from "./dev-tools.server";

const request = (url: string) => new Request(url);

describe("requireDevTools", () => {
  it("opens in pnpm dev from localhost", () => {
    expect(() => requireDevTools(request("http://localhost:5173/dev/sign-in"), true)).not.toThrow();
    expect(isLocalRequest(request("http://127.0.0.1:5173/dev/sign-in"))).toBe(true);
  });

  it("answers 404 in a production build", () => {
    expect(() => requireDevTools(request("http://localhost:5173/dev/sign-in"), false)).toThrow(
      expect.objectContaining({ init: expect.objectContaining({ status: 404 }) }),
    );
  });

  it("answers 404 through a tunnel even in pnpm dev", () => {
    expect(() =>
      requireDevTools(request("https://algo.trycloudflare.com/dev/sign-in"), true),
    ).toThrow();
  });
});

describe("routes", () => {
  const routesWith = async (nodeEnv: string) => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", nodeEnv);
    try {
      return JSON.stringify((await import("../routes")).default);
    } finally {
      vi.unstubAllEnvs();
    }
  };

  it("doesn't register /dev/sign-in in the production build", async () => {
    expect(await routesWith("development")).toContain("routes/dev/sign-in.tsx");
    expect(await routesWith("production")).not.toContain("routes/dev");
  });
});
