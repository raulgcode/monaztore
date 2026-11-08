import { createTestDatabase } from "@monaztore/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type App, buildApp } from "./app";

const connection = createTestDatabase();
let app: App;

beforeAll(async () => {
  app = await buildApp({ db: connection.db, appUrl: "http://localhost:5173" });
});
afterAll(async () => {
  await app.close();
  await connection.close();
});

describe("GET /health", () => {
  it("reports the database as reachable", async () => {
    const response = await app.inject({ url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", database: "ok" });
  });
});

describe("security headers", () => {
  it("answers with helmet's headers and only lets the web call it", async () => {
    const response = await app.inject({
      url: "/health",
      headers: { origin: "https://evil.example" },
    });
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("GET /openapi.json", () => {
  it("documents the routes", async () => {
    const response = await app.inject({ url: "/openapi.json" });
    expect(response.json().paths).toHaveProperty("/health");
  });
});
