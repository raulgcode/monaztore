import { describe, expect, it } from "vitest";
import { sandboxRefusal } from "./seed";

describe("sandboxRefusal", () => {
  it("lets the sandbox into a database on this machine", () => {
    expect(
      sandboxRefusal("postgres://u:p@localhost:5432/monaztore", "development"),
    ).toBeUndefined();
    expect(sandboxRefusal("postgres://u:p@127.0.0.1/monaztore", undefined)).toBeUndefined();
  });

  it("refuses a remote database and production", () => {
    expect(sandboxRefusal("postgres://u:p@db.fly.dev/monaztore", "development")).toContain(
      "db.fly.dev",
    );
    expect(sandboxRefusal("postgres://u:p@localhost/monaztore", "production")).toContain(
      "production",
    );
  });
});
