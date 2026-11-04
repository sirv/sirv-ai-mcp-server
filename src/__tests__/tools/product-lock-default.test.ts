import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { z } from "zod";
import { SirvApiClient } from "../../api-client.js";
import { registerImageProcessingTools } from "../../tools/image-processing.js";
import { registerProductTools } from "../../tools/product.js";
import type { ToolContext, ToolServer } from "../../tools/types.js";

// A real local HTTP server stands in for Studio and records each request body.
const servers: Array<ReturnType<typeof createServer>> = [];
async function studio() {
  const bodies: Array<Record<string, unknown>> = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      bodies.push(JSON.parse(raw || "{}"));
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ image: { url: "https://cdn.test/out.png" } }));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const client = new SirvApiClient(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, { kind: "apiKey", apiKey: "sk_live_test" });
  const tools = new Map<string, { schema: z.ZodType; handler: (params: unknown) => Promise<unknown> }>();
  const fakeServer = {
    registerTool: (name: string, config: { inputSchema: z.ZodType }, handler: never) => tools.set(name, { schema: config.inputSchema, handler }),
  } as unknown as ToolServer;
  const context = { getApiClient: () => client } as unknown as ToolContext;
  registerImageProcessingTools(fakeServer, context);
  registerProductTools(fakeServer, context);
  // The MCP SDK parses arguments through the tool's input schema before it calls the handler.
  const call = (name: string, args: Record<string, unknown>) => {
    const tool = tools.get(name)!;
    return tool.handler(tool.schema.parse(args));
  };
  return { bodies, call };
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

const cases = [
  { tool: "sirv_background_replace", args: { image_url: "https://cdn.test/in.png", prompt: "a beach" } },
  { tool: "sirv_product_lifestyle", args: { image_url: "https://cdn.test/in.png", scene_description: "a kitchen" } },
];

describe("product lock default", () => {
  for (const { tool, args } of cases) {
    it(`${tool} sends the product lock when the caller picks no model`, async () => {
      const { bodies, call } = await studio();

      await call(tool, args);

      expect(bodies[0].model).toBe("ideogram-keep");
    });

    it(`${tool} sends the model the caller picks`, async () => {
      const { bodies, call } = await studio();

      await call(tool, { ...args, model: "bria" });

      expect(bodies[0].model).toBe("bria");
    });
  }
});
