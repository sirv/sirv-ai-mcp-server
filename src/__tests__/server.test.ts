import { createRequire } from "node:module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, it } from "vitest";
import { createMcpServer } from "../server.js";

const { version } = createRequire(import.meta.url)("../../package.json") as { version: string };

async function connect() {
  const server = createMcpServer({ getApiClient: () => { throw new Error("not called"); } } as never);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientTransport);
  return client;
}

it("offers workflow prompts that carry the caller's arguments", async () => {
  const client = await connect();

  const { prompts } = await client.listPrompts();
  const listing = await client.getPrompt({ name: "prepare-listing-image", arguments: { assetId: "asset-42" } });
  const sweep = await client.getPrompt({ name: "alt-text-sweep", arguments: { folderId: "folder-9" } });

  expect(prompts.map((prompt) => prompt.name).sort()).toEqual(["alt-text-sweep", "prepare-listing-image"]);
  expect(JSON.stringify(listing.messages)).toContain("asset-42");
  expect(JSON.stringify(sweep.messages)).toContain("folder-9");
});

it("advertises the package version and usage instructions", async () => {
  const client = await connect();

  expect(client.getServerVersion()).toMatchObject({ name: "sirv-ai-mcp-server", version });
  expect(client.getInstructions()?.length).toBeGreaterThan(0);
});
