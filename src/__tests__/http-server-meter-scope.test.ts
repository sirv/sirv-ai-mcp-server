import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { SirvApiClient } from "../api-client.js";
import { createHttpServer } from "../http-server.js";
import { MCP_METERED_HEADER } from "../jwt.js";

// A real local server stands in for Studio's key check and request meter, and
// counts the meter calls: one unit of the monthly API/MCP limit each. It also
// keeps the metered header of each tool's Studio call.
const servers: Server[] = [];
let meterCalls = 0;
let meterStatus = 200;
let studioMeteredHeaders: Array<string | undefined> = [];
async function listen(server: Server) {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
async function mcp() {
  const { server } = createHttpServer(
    (token, metered) => {
      const client = new SirvApiClient(process.env.SIRV_AI_BASE_URL ?? "", { kind: "requestToken", token: token ?? "", metered });
      const tools = new McpServer({ name: "test", version: "1.0.0" });
      tools.registerTool("sirv_ping", { description: "ping" }, async () => {
        await client.authorizeTool("sirv_ping");
        return { content: [{ type: "text", text: "pong" }] };
      });
      return tools;
    },
    { baseUrl: "http://mcp.test", port: 0 },
  );
  return listen(server);
}
function send(url: string, token: string, method: string, params: unknown = {}) {
  return fetch(`${url}/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}
// The reply streams, so the tool has run only once the body is read.
async function callPing(url: string, token: string) {
  const response = await send(url, token, "tools/call", { name: "sirv_ping", arguments: {} });
  await response.text();
  return response.status;
}
const oauthToken = () =>
  new SignJWT({ type: "mcp_access", orgId: "org-1", clientId: "client-claude", scope: "full" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("user-oauth")
    .setIssuer("sirv-ai-studio")
    .setAudience("sirv-ai-mcp")
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET));

let log: MockInstance<typeof console.error>;
beforeEach(async () => {
  log = vi.spyOn(console, "error").mockImplementation(() => {});
  meterCalls = 0;
  meterStatus = 200;
  studioMeteredHeaders = [];
  process.env.AUTH_SECRET = "meter-test-secret-meter-test-secret";
  process.env.SIRV_AI_BASE_URL = await listen(
    createServer((req, res) => {
      if (req.url === "/api/mcp/meter-request") {
        meterCalls += 1;
        if (meterStatus !== 200) return res.writeHead(meterStatus).end();
      }
      if (req.url === "/api/mcp/authorize-tool") {
        studioMeteredHeaders.push(req.headers[MCP_METERED_HEADER.toLowerCase()] as string | undefined);
      }
      const reply = req.url === "/api/mcp/validate-key" ? { valid: true, userId: "user-key", orgId: "org-key" } : { allowed: true };
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(reply));
    }),
  );
});
afterEach(async () => {
  log.mockRestore();
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

// Connecting costs nothing; one tool action costs one unit. Studio's REST
// meter counts API-key calls, and skips MCP tokens, so each counts once.
describe("MCP request metering", () => {
  it("never counts connection and discovery traffic", async () => {
    const url = await mcp();
    const token = await oauthToken();

    await send(url, token, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } });
    await send(url, token, "tools/list");

    expect(meterCalls).toBe(0);
  });

  it("counts one tool call with an MCP token once", async () => {
    const url = await mcp();

    expect(await callPing(url, await oauthToken())).toBe(200);

    expect(meterCalls).toBe(1);
    expect(studioMeteredHeaders).toHaveLength(1);
    expect(studioMeteredHeaders[0]).toBeTruthy();
  });

  // A meter that fails open counted nothing, so Studio's REST meter must count
  // the tool's calls: they carry no signed header.
  it("leaves a fail-open tool call to Studio's REST meter", async () => {
    meterStatus = 503;
    const url = await mcp();

    expect(await callPing(url, await oauthToken())).toBe(200);

    expect(meterCalls).toBe(1);
    expect(studioMeteredHeaders).toEqual([undefined]);
  });

  // A batch could run two actions for one count, so it may hold one tools/call.
  it("refuses a batch with more than one tool call, and counts nothing", async () => {
    const url = await mcp();
    const call = (id: number) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "sirv_ping", arguments: {} } });

    const response = await fetch(`${url}/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await oauthToken()}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify([call(1), call(2)]),
    });

    expect(response.status).toBe(400);
    expect(meterCalls).toBe(0);
  });

  it("leaves an API key's tool call to Studio's REST meter", async () => {
    const url = await mcp();

    expect(await callPing(url, "sk_live_meter")).toBe(200);

    expect(meterCalls).toBe(0);
  });
});
