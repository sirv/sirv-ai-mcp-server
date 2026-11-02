import { createRequire } from "node:module";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpServer } from "../http-server.js";

const { version } = createRequire(import.meta.url)("../../package.json") as { version: string };

// A real local server stands in for Studio's API key check.
const servers: Server[] = [];
async function listen(server: Server) {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
let keyChecks = 0;
// Keys named sk_live_good-<user> are valid for that user; every other key is refused.
async function studioRejectingKeys() {
  return listen(
    createServer((req, res) => {
      if (req.url === "/api/mcp/validate-key") keyChecks++;
      const token = req.headers.authorization?.slice("Bearer ".length) ?? "";
      const reply = token.startsWith("sk_live_good-")
        ? { valid: true, userId: token.slice("sk_live_good-".length), orgId: "org-1" }
        : { valid: false };
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(reply));
    }),
  );
}
async function mcp() {
  const { server } = createHttpServer(() => new McpServer({ name: "test", version: "1.0.0" }), {
    baseUrl: "http://mcp.test",
    port: 0,
  });
  return listen(server);
}
function post(url: string, headers: Record<string, string>) {
  return fetch(`${url}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
}

beforeEach(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  keyChecks = 0;
  process.env.SIRV_AI_BASE_URL = await studioRejectingKeys();
  process.env.AUTH_SECRET = "hardening-test-secret-hardening-test";
});
afterEach(async () => {
  vi.restoreAllMocks();
  delete process.env.MCP_SKIP_AUTH;
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

describe("MCP HTTP hardening", () => {
  it("rate-limits callers before it checks their credentials", async () => {
    const url = await mcp();

    const statuses: number[] = [];
    for (let i = 0; i < 101; i++) {
      statuses.push((await post(url, { Authorization: `Bearer sk_live_fake${i}` })).status);
    }

    expect(statuses.at(-1)).toBe(429);
    expect(keyChecks).toBeLessThanOrEqual(100);
  });

  it("holds concurrent fake keys to the same budget", async () => {
    const url = await mcp();

    await Promise.all(
      Array.from({ length: 80 }, (_, i) => post(url, { Authorization: `Bearer sk_live_burst${i}` })),
    );

    expect(keyChecks).toBeLessThanOrEqual(30);
  });

  // Expired OAuth tokens are checked locally and are routine on a shared connector IP.
  it("does not lock out a shared IP for expired OAuth tokens", async () => {
    const url = await mcp();

    for (let i = 0; i < 40; i++) {
      expect((await post(url, { Authorization: `Bearer expired-jwt-${i}` })).status).toBe(401);
    }

    expect((await post(url, { Authorization: "Bearer sk_live_good-carol" })).status).not.toBe(429);
  });

  // Claude and ChatGPT connectors reach the server from a few shared IPs.
  it("gives each signed-in caller its own budget on a shared IP", async () => {
    const url = await mcp();

    let last = 0;
    for (let i = 0; i < 101; i++) {
      last = (await post(url, { Authorization: "Bearer sk_live_good-alice" })).status;
    }

    expect(last).toBe(429);
    expect((await post(url, { Authorization: "Bearer sk_live_good-bob" })).status).not.toBe(429);
  });

  it("points every 401 at the protected resource metadata", async () => {
    const url = await mcp();

    for (const token of ["sk_live_unknown", "not-a-jwt"]) {
      const res = await post(url, { Authorization: `Bearer ${token}` });
      expect(res.status, token).toBe(401);
      expect(res.headers.get("www-authenticate"), token).toContain(
        'resource_metadata="http://mcp.test/.well-known/oauth-protected-resource"',
      );
    }
  });

  it("refuses a foreign Origin when auth is skipped for local testing", async () => {
    process.env.MCP_SKIP_AUTH = "true";
    const url = await mcp();

    expect((await post(url, { Origin: "https://attacker.example" })).status).toBe(403);
    expect((await post(url, { Origin: "http://mcp.test" })).status).not.toBe(403);
  });

  it("reports the package version on /health", async () => {
    const url = await mcp();

    const health = (await (await fetch(`${url}/health`)).json()) as { version: string };

    expect(health.version).toBe(version);
  });
});
