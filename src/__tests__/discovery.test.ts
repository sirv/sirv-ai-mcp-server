import { createRequire } from "node:module";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHttpServer } from "../http-server.js";

const pkg = createRequire(import.meta.url)("../../package.json") as { mcpName: string; version: string };

let server: Server;
async function mcp() {
  ({ server } = createHttpServer(() => new McpServer({ name: "test", version: "1.0.0" }), {
    baseUrl: "https://mcp.example",
    port: 0,
  }) as { server: Server });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise((resolve) => server.close(resolve));
});

it("publishes a Server Card that any origin can read", async () => {
  const url = await mcp();

  const res = await fetch(`${url}/server-card`);
  const card = (await res.json()) as Record<string, unknown>;

  expect(res.headers.get("content-type")).toContain("application/mcp-server-card+json");
  expect(res.headers.get("access-control-allow-origin")).toBe("*");
  expect(card).toMatchObject({
    $schema: "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
    name: pkg.mcpName,
    version: pkg.version,
    remotes: [{ type: "streamable-http", url: "https://mcp.example" }],
  });
});

it("serves the same card at the well-known paths older checkers probe", async () => {
  const url = await mcp();
  const card = await (await fetch(`${url}/server-card`)).json();

  for (const path of ["/.well-known/mcp", "/.well-known/mcp.json"]) {
    expect(await (await fetch(`${url}${path}`)).json(), path).toEqual(card);
  }
});

it("lists the card in the domain AI Catalog", async () => {
  const url = await mcp();

  const catalog = (await (await fetch(`${url}/.well-known/ai-catalog.json`)).json()) as {
    entries: { type: string; url: string }[];
  };

  expect(catalog.entries).toEqual([
    expect.objectContaining({ type: "application/mcp-server-card+json", url: "https://mcp.example/server-card" }),
  ]);
});
