import { describe, expect, it } from "vitest";
import { bodySizeProblem, MAX_REQUEST_BYTES } from "./request-limits";

const request = (method: string, headers: Record<string, string>) => ({
  method,
  headers: new Headers(headers),
});

describe("bodySizeProblem", () => {
  it("lets a form of normal size through", () => {
    expect(bodySizeProblem(request("POST", { "Content-Length": "1200" }))).toBeUndefined();
  });

  it("refuses a body bigger than the limit", () => {
    expect(
      bodySizeProblem(request("POST", { "Content-Length": String(MAX_REQUEST_BYTES + 1) })),
    ).toBe(413);
    expect(bodySizeProblem(request("POST", { "Content-Length": "2000" }), 1000)).toBe(413);
  });

  it("asks for the length when the body comes in chunks", () => {
    expect(bodySizeProblem(request("POST", { "Transfer-Encoding": "chunked" }))).toBe(411);
  });

  it("refuses a length that isn't a number", () => {
    expect(bodySizeProblem(request("POST", { "Content-Length": "lots" }))).toBe(411);
  });

  it("doesn't look at reads", () => {
    expect(bodySizeProblem(request("GET", { "Transfer-Encoding": "chunked" }))).toBeUndefined();
  });
});
