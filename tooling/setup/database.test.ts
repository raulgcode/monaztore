import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { databaseAddress, isListening } from "./database";

describe("databaseAddress", () => {
  it("reads host and port from a Postgres URL", () => {
    expect(databaseAddress("postgres://u:p@localhost:5433/db")).toEqual({
      host: "localhost",
      port: 5433,
    });
  });

  it("uses 5432 when the URL has no port", () => {
    expect(databaseAddress("postgresql://u@db.internal/db")).toEqual({
      host: "db.internal",
      port: 5432,
    });
  });

  it("ignores what isn't a Postgres URL", () => {
    expect(databaseAddress("mysql://localhost/db")).toBeUndefined();
    expect(databaseAddress("not a url")).toBeUndefined();
  });
});

describe("isListening", () => {
  it("says whether a port accepts connections", async () => {
    const server = createServer().listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    expect(await isListening({ host: "127.0.0.1", port: address.port })).toBe(true);
    await new Promise((resolve) => server.close(resolve));
    expect(await isListening({ host: "127.0.0.1", port: address.port })).toBe(false);
  });
});
