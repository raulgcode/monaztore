import { describe, expect, it } from "vitest";
import { latestVersion, nextVersion, parseVersion } from "./version";

describe("parseVersion", () => {
  it("reads a release tag with or without the v", () => {
    expect(parseVersion("v1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseVersion("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it("ignores tags that are not a plain release", () => {
    expect(parseVersion("v1.2")).toBeUndefined();
    expect(parseVersion("v1.2.3-beta.1")).toBeUndefined();
    expect(parseVersion("e2e-run")).toBeUndefined();
    expect(parseVersion("v01.2.3")).toBeUndefined();
  });
});

describe("latestVersion", () => {
  it("compares numbers, not text", () => {
    expect(latestVersion(["v1.9.0", "v1.10.0", "v1.2.30", "other"])).toEqual({
      major: 1,
      minor: 10,
      patch: 0,
    });
  });

  it("starts at 0.0.0 without releases", () => {
    expect(latestVersion([])).toEqual({ major: 0, minor: 0, patch: 0 });
  });
});

describe("nextVersion", () => {
  const tags = ["v1.4.2", "v1.3.9"];

  it("bumps from the latest release", () => {
    expect(nextVersion(tags, "patch")).toBe("v1.4.3");
    expect(nextVersion(tags, "minor")).toBe("v1.5.0");
    expect(nextVersion(tags, "major")).toBe("v2.0.0");
  });

  it("takes an exact version above the latest", () => {
    expect(nextVersion(tags, "1.5.0")).toBe("v1.5.0");
    expect(nextVersion([], "v1.0.0")).toBe("v1.0.0");
  });

  it("refuses a version that is not above the latest", () => {
    expect(() => nextVersion(tags, "1.4.2")).toThrow(/v1\.4\.2/);
    expect(() => nextVersion(tags, "1.0.0")).toThrow(/v1\.4\.2/);
  });

  it("refuses what is neither a bump nor a version", () => {
    expect(() => nextVersion(tags, "next")).toThrow(/patch, minor, major/);
  });
});
