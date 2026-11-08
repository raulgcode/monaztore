import { describe, expect, it } from "vitest";
import {
  bodySizeProblem,
  DIGITAL_UPLOAD_REQUEST_BYTES,
  MAX_REQUEST_BYTES,
  maxRequestBytes,
} from "./request-limits";

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

describe("maxRequestBytes", () => {
  it("takes a digital product's file only in its section of the workspace", () => {
    expect(maxRequestBytes("/app/tienda-a1b2c3/downloads/new")).toBe(DIGITAL_UPLOAD_REQUEST_BYTES);
    expect(maxRequestBytes("/app/tienda-a1b2c3/downloads")).toBe(DIGITAL_UPLOAD_REQUEST_BYTES);
    expect(maxRequestBytes("/app/tienda-a1b2c3/pages/x")).toBe(MAX_REQUEST_BYTES);
    expect(maxRequestBytes("/downloads/token")).toBe(MAX_REQUEST_BYTES);
    expect(maxRequestBytes("/app/tienda/downloadsx")).toBe(MAX_REQUEST_BYTES);
  });
});
