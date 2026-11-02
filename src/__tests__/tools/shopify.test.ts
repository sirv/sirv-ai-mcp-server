import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import type { z } from "zod";
import { afterEach, describe, expect, it } from "vitest";
import { SirvApiClient } from "../../api-client.js";
import { registerShopifyTools } from "../../tools/shopify.js";
import type { ToolContext, ToolServer } from "../../tools/types.js";

type Seen = { method?: string; url?: string; headers: IncomingMessage["headers"]; body: unknown };

// A real local HTTP server stands in for Studio, so the real client sends real requests.
const servers: Array<ReturnType<typeof createServer>> = [];
async function studio(status: number, reply: unknown) {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : undefined });
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(reply));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const client = new SirvApiClient(`http://127.0.0.1:${port}`, { kind: "apiKey", apiKey: "sk_live_test" });
  const handlers = new Map<string, (params: Record<string, unknown>) => Promise<unknown>>();
  const schemas = new Map<string, z.ZodTypeAny>();
  registerShopifyTools(
    {
      registerTool: (name: string, config: { inputSchema: z.ZodTypeAny }, handler: never) => {
        schemas.set(name, config.inputSchema);
        handlers.set(name, handler);
      },
    } as unknown as ToolServer,
    { getApiClient: () => client } as unknown as ToolContext,
  );
  return { handlers, schemas, seen };
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

describe("Shopify MCP tools", () => {
  it("publishes a Studio asset to a Studio product through the publish route", async () => {
    const productId = "7b1c9f9e-2f7c-4c56-9a43-3c0c2f6f1a11";
    const assetId = "0f6d1a52-5b0e-4a51-8f53-63d8e7f2a7c2";
    const { handlers, seen } = await studio(202, { planId: "plan-1", runId: "run-1", status: "pending" });

    const result = await handlers.get("sirv_push_image_to_shopify")?.({
      productId,
      assetId,
      alt_text: "Red shoe",
      set_as_featured: true,
      orgId: "org-1",
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      method: "POST",
      url: `/api/shopify/products/${productId}/publish`,
      body: { asset_id: assetId, product_id: productId, alt_text: "Red shoe", strategy: "add", set_as_featured: true },
    });
    expect(seen[0].headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(seen[0].headers["x-org-id"]).toBe("org-1");
    expect(result).toMatchObject({ structuredContent: { planId: "plan-1", runId: "run-1" } });
    expect(result).not.toHaveProperty("isError");
  });

  // replace_all deletes every image of the product in the store; people do that in Studio.
  it("only adds images, never replaces the store's images", async () => {
    const { schemas } = await studio(202, {});
    const call = { productId: "7b1c9f9e-2f7c-4c56-9a43-3c0c2f6f1a11", assetId: "0f6d1a52-5b0e-4a51-8f53-63d8e7f2a7c2" };

    expect(schemas.get("sirv_push_image_to_shopify")?.safeParse({ ...call, strategy: "replace_all" }).success).toBe(false);
    expect(schemas.get("sirv_push_image_to_shopify")?.safeParse(call).success).toBe(true);
  });

  it("reuses the caller's idempotency key, so a retry cannot publish twice", async () => {
    const { handlers, seen } = await studio(202, { planId: "plan-1", runId: "run-1", status: "pending" });
    const call = {
      productId: "7b1c9f9e-2f7c-4c56-9a43-3c0c2f6f1a11",
      assetId: "0f6d1a52-5b0e-4a51-8f53-63d8e7f2a7c2",
      idempotencyKey: "5d0f3f0e-8a4b-4a39-9f36-1b6f0b4c2d11",
    };

    await handlers.get("sirv_push_image_to_shopify")?.(call);
    await handlers.get("sirv_push_image_to_shopify")?.(call);

    expect(seen.map((request) => request.headers["idempotency-key"])).toEqual([call.idempotencyKey, call.idempotencyKey]);
    expect(seen[0].body).not.toHaveProperty("idempotencyKey");
  });

  it("starts a catalog import and reports its run", async () => {
    const { handlers, seen } = await studio(202, { runId: "run-9", created: true, shopDomain: "shoe.myshopify.com" });

    const result = await handlers.get("sirv_sync_shopify_products")?.({ importImages: false });

    expect(seen[0]).toMatchObject({ method: "POST", url: "/api/shopify/sync-products", body: { importImages: false } });
    expect(result).toMatchObject({ structuredContent: { runId: "run-9", shopDomain: "shoe.myshopify.com" } });
    expect(result).not.toHaveProperty("isError");
  });
});
