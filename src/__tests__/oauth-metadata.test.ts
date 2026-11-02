import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it } from "vitest";
import { createHttpServer } from "../http-server.js";

const servers: Server[] = [];
async function metadata(path: string) {
  const { server } = createHttpServer(() => new McpServer({ name: "test", version: "1.0.0" }), {
    baseUrl: "http://mcp.test",
    port: 0,
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`);
  return response.json() as Promise<{ scopes_supported: string[] }>;
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

// Studio's authorize step refuses any scope outside its grant list
// (normalizeOAuthGrantScope), so a client that asks for every advertised
// scope must still be able to sign in.
describe("OAuth metadata scopes", () => {
  it.each(["/.well-known/oauth-authorization-server", "/.well-known/oauth-protected-resource"])(
    "%s advertises only scopes Studio grants",
    async (path) => {
      expect((await metadata(path)).scopes_supported).toEqual(["sirv-ai:read", "sirv-ai:write"]);
    },
  );
});
