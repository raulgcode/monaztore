import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { AiCaller } from "@monaztore/core";
import type { Database } from "@monaztore/db";
import { project } from "@monaztore/env/project";
import { describe, expect, it } from "vitest";
import { createMcpServer } from "./server";

// Listing the tools touches no database: the fake one only has to exist.
const caller: AiCaller = {
  db: {} as Database,
  userId: "user-1",
  clientId: "client-1",
  clientName: "Claude",
  scopes: ["store"],
};

async function connect() {
  const server = createMcpServer(caller, { appUrl: "https://app.example.test" });
  const client = new Client({ name: "test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("the MCP server", () => {
  it("presents itself with the project's name and the workspace's address", async () => {
    const client = await connect();
    expect(client.getServerVersion()).toMatchObject({
      name: project.slug,
      title: project.name,
      websiteUrl: "https://app.example.test",
    });
    expect(client.getInstructions()).toContain("list_stores");
    await client.close();
  });

  // What the assistants (and the connector directories) read to decide when to ask first.
  it("gives every tool a name, a title, a description and the three hints", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(40);
    for (const tool of tools) {
      expect(tool.name, tool.name).toMatch(/^[a-z][a-z0-9_]{0,63}$/);
      expect(tool.title, tool.name).toBeTruthy();
      expect(tool.description, tool.name).toBeTruthy();
      expect(typeof tool.annotations?.readOnlyHint, tool.name).toBe("boolean");
      expect(typeof tool.annotations?.destructiveHint, tool.name).toBe("boolean");
      expect(typeof tool.annotations?.openWorldHint, tool.name).toBe("boolean");
      // A tool that only reads can't also destroy.
      if (tool.annotations?.readOnlyHint) {
        expect(tool.annotations.destructiveHint, tool.name).toBe(false);
      }
    }
    await client.close();
  });

  it("names its store the same way in every tool but list_stores", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    for (const tool of tools.filter((t) => t.name !== "list_stores")) {
      expect(tool.inputSchema.required, tool.name).toContain("store");
    }
    await client.close();
  });
});
