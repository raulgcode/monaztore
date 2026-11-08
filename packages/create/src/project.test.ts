import { describe, expect, it } from "vitest";
import { readIdentity, setStoreMode } from "./project.ts";

describe("readIdentity", () => {
  it("reads the name, slug and domain of packages/env/src/project.ts", () => {
    const file = `export const project = {\n  /** x */\n  name: "Monaztore",\n  slug: "monaztore",\n  domain: "monaztore.com",\n} as const;`;
    expect(readIdentity(file)).toEqual({
      name: "Monaztore",
      slug: "monaztore",
      domain: "monaztore.com",
    });
  });

  it("is undefined for a file that doesn't say who the project is", () => {
    expect(readIdentity('export const project = { name: "X" };')).toBeUndefined();
  });
});

describe("setStoreMode", () => {
  it("changes STORE_MODE in an env file and keeps the rest", () => {
    expect(setStoreMode("A=1\nSTORE_MODE=multi\nB=2\n", "single")).toBe(
      "A=1\nSTORE_MODE=single\nB=2\n",
    );
  });
});
