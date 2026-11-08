import { describe, expect, it, vi } from "vitest";

// The module reads the server's env at import; these tests only need the pure helper.
vi.mock("./services.server", () => ({ auth: {}, authMethods: ["magic-link"] }));
vi.mock("./rate-limit.server", () => ({}));

const { emailModeOf } = await import("./sign-in.server");
const url = (search = "") => new URL(`http://localhost/login${search}`);

describe("emailModeOf", () => {
  it("shows the password first when it is on", () => {
    expect(emailModeOf(url(), ["magic-link", "password"])).toBe("password");
    expect(emailModeOf(url("?with=link"), ["magic-link", "password"])).toBe("magic-link");
  });

  it("only offers the methods that are on", () => {
    expect(emailModeOf(url("?with=password"), ["magic-link"])).toBe("magic-link");
    expect(emailModeOf(url("?with=link"), ["password"])).toBe("password");
    expect(emailModeOf(url(), ["google"])).toBeNull();
  });
});
