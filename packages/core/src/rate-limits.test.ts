import { describe, expect, it } from "vitest";
import { clientAddress } from "./rate-limits";

const headers = (values: Record<string, string>) => new Headers(values);

describe("clientAddress", () => {
  it("reads the header the platform's proxy sets", () => {
    expect(clientAddress(headers({ "fly-client-ip": "203.0.113.7" }), "fly-client-ip")).toBe(
      "203.0.113.7",
    );
  });

  it("takes the first address of X-Forwarded-For", () => {
    expect(
      clientAddress(headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }), "x-forwarded-for"),
    ).toBe("203.0.113.7");
  });

  it("answers unknown without the header, so every such caller shares one bucket", () => {
    expect(clientAddress(headers({}), "fly-client-ip")).toBe("unknown");
  });

  it("ignores what isn't an address", () => {
    expect(clientAddress(headers({ "fly-client-ip": "<script>" }), "fly-client-ip")).toBe(
      "unknown",
    );
  });
});
