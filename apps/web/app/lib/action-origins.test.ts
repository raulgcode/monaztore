import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { actionOrigins } from "./action-origins";

const flyToml = readFileSync(new URL("../../../../fly.web.toml", import.meta.url), "utf8");

describe("actionOrigins", () => {
  it("includes the production APP_URL host", () => {
    const url = flyToml.match(/^\s*APP_URL\s*=\s*"([^"]+)"/m)?.[1];
    expect(url).toBeDefined();
    expect(actionOrigins).toContain(new URL(url as string).host);
  });
});
