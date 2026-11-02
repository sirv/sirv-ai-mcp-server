import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it } from "vitest";
import { SirvApiClient } from "../../api-client.js";
import { registerAllTools } from "../../tools/index.js";

// A real local server stands in for Studio's REST API and records each request.
const servers: Server[] = [];
const seen: { method: string; url: string }[] = [];
async function studio(reply: (url: string) => unknown) {
  const server = createServer((req, res) => {
    seen.push({ method: req.method ?? "", url: req.url ?? "" });
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(reply(req.url ?? "")));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
async function connect(baseUrl: string) {
  const server = new McpServer({ name: "test", version: "1.0.0" });
  const api = new SirvApiClient(baseUrl, { kind: "apiKey", apiKey: "sk_live_test" });
  registerAllTools(server, { getApiClient: () => api });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientTransport);
  return client;
}
function text(result: Awaited<ReturnType<Client["callTool"]>>) {
  return (result.content as { type: string; text: string }[]).map((part) => part.text).join("\n");
}

afterEach(async () => {
  seen.length = 0;
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

describe("tool results a model can act on", () => {
  it("lists asset ids and how to fetch the next page", async () => {
    const client = await connect(
      await studio(() => ({
        assets: [{ id: "asset-7", url: "https://cdn.example/boot.jpg", filename: "boot.jpg", mimeType: "image/jpeg" }],
        total: 45,
      })),
    );

    const out = text(await client.callTool({ name: "sirv_list_assets", arguments: { limit: 1, offset: 4 } }));

    expect(out).toContain("asset-7");
    expect(out).toContain("https://cdn.example/boot.jpg");
    expect(out).toContain("offset=5");
  });

  it("lists product ids", async () => {
    const client = await connect(
      await studio(() => ({ products: [{ id: "prod-3", name: "Boot", sku: "B1", status: "active" }], total: 1 })),
    );

    const out = text(await client.callTool({ name: "sirv_list_products", arguments: {} }));

    expect(out).toContain("prod-3");
    expect(out).not.toContain("offset=");
  });

  it("keeps a caller-supplied id inside its own path segment", async () => {
    // Studio's authorize-tool check answers first, then the delete itself.
    const client = await connect(await studio(() => ({ allowed: true, deleted: true })));

    await client.callTool({ name: "sirv_delete_asset", arguments: { id: "../products/prod-3" } });

    expect(seen.find((req) => req.method === "DELETE")?.url).toBe("/api/assets/..%2Fproducts%2Fprod-3");
  });

  it("refuses a dot-segment id instead of calling Studio", async () => {
    const client = await connect(await studio(() => ({ allowed: true, deleted: true })));

    const result = await client.callTool({ name: "sirv_delete_asset", arguments: { id: ".." } });

    expect(result.isError).toBe(true);
    expect(seen.some((req) => req.method === "DELETE")).toBe(false);
  });
});

describe("tool hints", () => {
  // Each call spends credits and saves a new asset, so a repeat is not a no-op.
  const CREDIT_TOOLS = [
    "sirv_remove_background",
    "sirv_upscale",
    "sirv_alt_text",
    "sirv_depth_map",
    "sirv_batch_remove_background",
    "sirv_batch_upscale",
  ];

  it("marks credit-spending tools as neither read-only nor idempotent", async () => {
    const client = await connect("http://127.0.0.1:9");
    const { tools } = await client.listTools();
    const hints = Object.fromEntries(tools.map((tool) => [tool.name, tool.annotations]));

    for (const name of CREDIT_TOOLS) {
      expect(hints[name], name).toMatchObject({ readOnlyHint: false, idempotentHint: false });
    }
  });
});
