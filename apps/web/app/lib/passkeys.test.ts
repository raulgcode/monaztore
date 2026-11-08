import { describe, expect, it } from "vitest";
import { deviceNameOf, passkeyResponseOf } from "./passkeys";

describe("deviceNameOf", () => {
  it.each([
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
      "iPhone",
    ],
    [
      "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36",
      "Android",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
      "Mac",
    ],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0", "Windows"],
    ["Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/130.0", "Chromebook"],
  ])("names the device of %s", (userAgent, name) => {
    expect(deviceNameOf(userAgent)).toBe(name);
  });

  it("has no name for a browser that doesn't say", () => {
    expect(deviceNameOf("curl/8.0")).toBeNull();
  });
});

describe("passkeyResponseOf", () => {
  it("reads the browser's JSON", () => {
    expect(passkeyResponseOf(JSON.stringify({ id: "abc", type: "public-key" }))).toEqual({
      id: "abc",
      type: "public-key",
    });
  });

  it.each([null, "", "not json", "null", "42", JSON.stringify({ type: "public-key" })])(
    "turns %s into null",
    (value) => {
      expect(passkeyResponseOf(value)).toBeNull();
    },
  );
});
