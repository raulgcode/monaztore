import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as core from "@monaztore/core";
import { describe, expect, it } from "vitest";
import { notInMcp } from "./coverage";

const here = import.meta.dirname;
const sources = [here, join(here, "tools")]
  .flatMap((dir) =>
    readdirSync(dir)
      .filter(
        (file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && file !== "coverage.ts",
      )
      .map((file) => readFileSync(join(dir, file), "utf8")),
  )
  .join("\n");

/** The use cases and helpers of core: its exported functions (classes start upper case). */
const useCases = Object.entries(core)
  .filter(([name, value]) => typeof value === "function" && /^[a-z]/.test(name))
  .map(([name]) => name);

const calledByATool = (name: string) => new RegExp(`\\b${name}\\b`).test(sources);

describe("every backend feature has its MCP tools", () => {
  it("each use case of core is called by a tool, or says in coverage.ts why it isn't", () => {
    const missing = useCases.filter((name) => !calledByATool(name) && !notInMcp.has(name));
    expect(
      missing,
      "Add a tool in apps/api/src/mcp/tools (or a reason in coverage.ts) for",
    ).toEqual([]);
  });

  it("coverage.ts only lists what no tool calls and core still exports", () => {
    const stale = [...notInMcp.keys()].filter(
      (name) => calledByATool(name) || !useCases.includes(name),
    );
    expect(stale, "Remove from coverage.ts").toEqual([]);
  });
});
