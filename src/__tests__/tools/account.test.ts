import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { SirvApiClient } from "../../api-client.js";
import { registerAccountTools } from "../../tools/account.js";
import type { ToolContext, ToolServer } from "../../tools/types.js";

type Reply = { status: number; body: unknown };
const usageStats = { totalCredits: 12, totalOperations: 3, topOperations: [] };

// A real local HTTP server stands in for Studio, so the real client sends real requests.
const servers: Array<ReturnType<typeof createServer>> = [];
async function studio(token: string, replies: Record<string, Reply>) {
  const paths: string[] = [];
  const server = createServer((req, res) => {
    const path = (req.url ?? "").split("?")[0];
    paths.push(path);
    const reply = replies[path] ?? { status: 404, body: { error: "not found" } };
    res.writeHead(reply.status, { "content-type": "application/json" }).end(JSON.stringify(reply.body));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const client = new SirvApiClient(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, { kind: "requestToken", token });
  const handlers = new Map<string, (params: Record<string, unknown>) => Promise<unknown>>();
  registerAccountTools(
    { registerTool: (name: string, _config: unknown, handler: never) => handlers.set(name, handler) } as unknown as ToolServer,
    { getApiClient: () => client } as unknown as ToolContext,
  );
  return { usage: () => handlers.get("sirv_get_usage")?.({}) as Promise<Record<string, unknown>>, paths };
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

// A failed balance read must never reach the agent as a factual zero. The
// balance comes from /api/user/credits, the balance that charges use.
describe("sirv_get_usage", () => {
  it("reads an OAuth user's charged balance and the workspace plan", async () => {
    const { usage, paths } = await studio("eyJ.oauth.token", {
      "/api/user/usage/stats": { status: 200, body: usageStats },
      "/api/user/credits": { status: 200, body: { credits: 150 } },
      "/api/billing/subscription-status": { status: 200, body: { tierId: "growth", wallet: null } },
    });

    const result = await usage();

    expect(result).not.toHaveProperty("isError");
    expect(result.structuredContent).toMatchObject({ stats: { credits: 150, tier: "growth", creditsUsed: 12 } });
    expect((result.structuredContent as { stats: { topUpUrl: string } }).stats.topUpUrl).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/settings\/billing\?tab=credits&buy=1$/,
    );
    expect(paths).not.toContain("/api/zapier/me");
  });

  it("returns an error, not a zero balance, when the balance cannot be read", async () => {
    const { usage } = await studio("eyJ.oauth.token", {
      "/api/user/usage/stats": { status: 200, body: usageStats },
      "/api/user/credits": { status: 403, body: { error: "Permission denied: credits:view" } },
      "/api/billing/subscription-status": { status: 200, body: { tierId: "growth", wallet: null } },
    });

    const result = await usage();

    expect(result).toMatchObject({ isError: true });
    expect(result).not.toHaveProperty("structuredContent");
  });

  it("leaves the plan out, rather than inventing one, when only the plan cannot be read", async () => {
    const { usage } = await studio("eyJ.oauth.token", {
      "/api/user/usage/stats": { status: 200, body: usageStats },
      "/api/user/credits": { status: 200, body: { credits: 150 } },
      "/api/billing/subscription-status": { status: 403, body: { error: "Permission denied: billing:view" } },
    });

    const result = await usage();

    expect(result).not.toHaveProperty("isError");
    expect(result.structuredContent).toMatchObject({ stats: { credits: 150 } });
    expect((result.structuredContent as { stats: object }).stats).not.toHaveProperty("tier");
  });

  it("reads an API key's charged workspace balance, not the key owner's own balance", async () => {
    const { usage, paths } = await studio("sk_live_key", {
      "/api/user/usage/stats": { status: 200, body: usageStats },
      "/api/user/credits": { status: 200, body: { credits: 40 } },
      "/api/zapier/me": { status: 200, body: { credits: 0, tier: "PRO" } },
    });

    const result = await usage();

    expect(result.structuredContent).toMatchObject({ stats: { credits: 40, tier: "PRO" } });
    expect(paths).not.toContain("/api/billing/subscription-status");
  });

  it("returns an error, not a zero balance, when an API key's balance cannot be read", async () => {
    const { usage } = await studio("sk_live_key", {
      "/api/user/usage/stats": { status: 200, body: usageStats },
      "/api/user/credits": { status: 500, body: { error: "unavailable" } },
      "/api/zapier/me": { status: 200, body: { credits: 0, tier: "PRO" } },
    });

    expect(await usage()).toMatchObject({ isError: true });
  });
});
