import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { createHttpServer } from "../http-server.js";

// A real local server stands in for Studio's key check and request meter.
const servers: Server[] = [];
async function listen(server: Server) {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
async function studio() {
  return listen(
    createServer((req, res) => {
      const reply = req.url === "/api/mcp/validate-key" ? { valid: true, userId: "user-key", orgId: "org-key" } : { allowed: true };
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(reply));
    }),
  );
}
async function mcp() {
  const { server } = createHttpServer(
    () => {
      const tools = new McpServer({ name: "test", version: "1.0.0" });
      tools.registerTool("sirv_ping", { description: "ping" }, async () => ({ content: [{ type: "text", text: "pong" }] }));
      return tools;
    },
    { baseUrl: "http://mcp.test", port: 0 },
  );
  return listen(server);
}
function call(url: string, token: string, method: string, name = "sirv_ping") {
  return fetch(`${url}/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { name, arguments: { image_url: "https://private.example/x.png" } } }),
  });
}
function auditLines(log: MockInstance<typeof console.error>) {
  return log.mock.calls
    .map(([line]: unknown[]) => String(line))
    .filter((line) => line.includes('"event":"mcp.tool_call"'))
    .map((line) => JSON.parse(line));
}

let log: MockInstance<typeof console.error>;
beforeEach(async () => {
  log = vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.SIRV_AI_BASE_URL = await studio();
  process.env.AUTH_SECRET = "audit-test-secret-audit-test-secret";
});
afterEach(async () => {
  log.mockRestore();
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

describe("MCP tool call audit log", () => {
  it("logs one line per tool call with the API key's user, never the key or the arguments", async () => {
    const url = await mcp();

    expect((await call(url, "sk_live_audit123", "tools/call")).status).toBe(200);
    await call(url, "sk_live_audit123", "tools/list");

    expect(auditLines(log)).toEqual([{ event: "mcp.tool_call", tool: "sirv_ping", credential: "api_key", userId: "user-key", orgId: "org-key" }]);
    const everything = log.mock.calls.map((args: unknown[]) => args.map(String).join(" ")).join("\n");
    expect(everything).not.toContain("sk_live_audit123");
    expect(everything).not.toContain("private.example");
  });

  it("never copies a tool name that is not a tool name", async () => {
    const url = await mcp();

    await call(url, "sk_live_audit123", "tools/call", "sk_live_leaked https://private.example/");

    expect(auditLines(log)).toEqual([expect.objectContaining({ tool: "(invalid)" })]);
    expect(log.mock.calls.map((args: unknown[]) => args.map(String).join(" ")).join("\n")).not.toContain("sk_live_leaked");
  });

  it("names the OAuth client and workspace for an MCP access token", async () => {
    const token = await new SignJWT({ type: "mcp_access", orgId: "org-1", clientId: "client-claude", scope: "full" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-oauth")
      .setIssuer("sirv-ai-studio")
      .setAudience("sirv-ai-mcp")
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    const url = await mcp();

    expect((await call(url, token, "tools/call")).status).toBe(200);

    expect(auditLines(log)).toEqual([
      { event: "mcp.tool_call", tool: "sirv_ping", credential: "oauth", userId: "user-oauth", orgId: "org-1", clientId: "client-claude" },
    ]);
  });
});
