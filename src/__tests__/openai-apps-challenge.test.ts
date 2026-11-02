import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpServer } from "../http-server.js";

const servers: Server[] = [];
async function get(path: string) {
  const { server } = createHttpServer(() => new McpServer({ name: "test", version: "1.0.0" }), {
    baseUrl: "http://mcp.test",
    port: 0,
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`);
}
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

// OpenAI verifies the plugin domain by fetching this path; the body must be the
// portal's token and nothing else.
describe("OpenAI domain challenge", () => {
  it("serves exactly the configured token as plain text, without auth", async () => {
    vi.stubEnv("OPENAI_APPS_CHALLENGE", "tok_abc123");

    const response = await get("/.well-known/openai-apps-challenge");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(await response.text()).toBe("tok_abc123");
  });

  it("is not found when no token is configured", async () => {
    vi.stubEnv("OPENAI_APPS_CHALLENGE", "");

    const response = await get("/.well-known/openai-apps-challenge");

    expect(response.status).toBe(404);
  });
});
