import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { SirvApiClient } from "../../api-client.js";
import { registerImageProcessingTools } from "../../tools/image-processing.js";
import type { ToolContext, ToolServer } from "../../tools/types.js";

// A real local HTTP server stands in for Studio.
const servers: Array<ReturnType<typeof createServer>> = [];
async function tools(status: number) {
  const server = createServer((_req, res) => {
    res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify({ image: { url: "https://cdn.test/out.png" } }));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const client = new SirvApiClient(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, { kind: "apiKey", apiKey: "sk_live_test" });
  const handlers = new Map<string, (params: Record<string, unknown>) => Promise<{ structuredContent: Record<string, unknown> }>>();
  registerImageProcessingTools(
    { registerTool: (name: string, _config: unknown, handler: never) => handlers.set(name, handler) } as unknown as ToolServer,
    { getApiClient: () => client } as unknown as ToolContext,
  );
  return handlers;
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

const params = { image_url: "https://cdn.test/in.png", mask_url: "https://cdn.test/mask.png", prompt: "a wooden table" };

// The ChatGPT directory guidelines ask tools to leave diagnostic fields out of
// their output; the widget never read the timestamp.
describe("image processing tool output", () => {
  for (const [outcome, status] of [["success", 200], ["error", 500]] as const) {
    it(`carries no timestamp on ${outcome}`, async () => {
      const handlers = await tools(status);
      expect(handlers.size).toBe(4);

      for (const [name, handler] of handlers) {
        const { structuredContent } = await handler(params);
        expect(structuredContent.success, name).toBe(outcome === "success");
        expect(structuredContent, name).not.toHaveProperty("timestamp");
      }
    });
  }
});
