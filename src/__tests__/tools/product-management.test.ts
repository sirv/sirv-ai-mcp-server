import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { z } from "zod";
import { afterEach, describe, expect, it } from "vitest";
import { SirvApiClient } from "../../api-client.js";
import { registerProductManagementTools } from "../../tools/product-management.js";
import type { ToolContext, ToolServer } from "../../tools/types.js";

// A real local HTTP server stands in for Studio, so the real client sends real requests.
const servers: Array<ReturnType<typeof createServer>> = [];
async function studio() {
  const seen: unknown[] = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      seen.push(JSON.parse(raw || "{}"));
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ count: 1 }));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const client = new SirvApiClient(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, {
    kind: "apiKey",
    apiKey: "sk_live_test",
  });
  const handlers = new Map<string, (params: Record<string, unknown>) => Promise<unknown>>();
  const schemas = new Map<string, z.ZodTypeAny>();
  registerProductManagementTools(
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
const ids = (count: number) => Array.from({ length: count }, (_, index) => `product-${index}`);

// Products have no trash: an agent must not be able to wipe a catalogue in one call.
describe("Bulk product action safeguards", () => {
  it("offers no deleteAll", async () => {
    const { schemas } = await studio();

    expect(schemas.get("sirv_bulk_product_action")?.safeParse({ action: "deleteAll" }).success).toBe(false);
  });

  it("refuses to delete more than 25 products in one call and sends no delete to Studio", async () => {
    const { handlers, seen } = await studio();

    const result = await handlers.get("sirv_bulk_product_action")?.({ action: "delete", productIds: ids(26) });

    expect(result).toMatchObject({ isError: true });
    expect(seen).toEqual([]);
  });

  it("deletes up to 25 products in one call", async () => {
    const { handlers, seen } = await studio();

    const result = await handlers.get("sirv_bulk_product_action")?.({ action: "delete", productIds: ids(25) });

    expect(result).not.toHaveProperty("isError");
    expect(seen).toEqual([{ action: "delete", productIds: ids(25) }]);
  });

  it("keeps larger batches for changes that are not deletes", async () => {
    const { handlers, seen } = await studio();

    await handlers.get("sirv_bulk_product_action")?.({ action: "updateStatus", productIds: ids(40), status: "draft" });

    expect(seen).toHaveLength(1);
  });
});
