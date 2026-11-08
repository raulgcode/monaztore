import { describe, expect, it } from "vitest";
import { parseAuthChoice } from "./auth-choice";

describe("parseAuthChoice", () => {
  it("takes the numbers of the list", () => {
    expect(parseAuthChoice("3, 1", ["magic-link"])).toEqual(["magic-link", "google"]);
  });

  it("takes the names", () => {
    expect(parseAuthChoice("google password", ["magic-link"])).toEqual(["password", "google"]);
  });

  it("Enter keeps what was there", () => {
    expect(parseAuthChoice("  ", ["password"])).toEqual(["password"]);
  });

  it("doesn't repeat a method typed twice", () => {
    expect(parseAuthChoice("1,1,magic-link", [])).toEqual(["magic-link"]);
  });

  it.each(["4", "0", "facebook", "1,x"])("rechaza %j", (answer) => {
    expect(parseAuthChoice(answer, ["magic-link"])).toBeUndefined();
  });
});
