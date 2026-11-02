import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { SirvApiClient } from "../../api-client.js";
import { registerGenerationTools } from "../../tools/generation.js";
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
  const handlers = new Map<string, (params: Record<string, unknown>) => Promise<unknown>>();
  registerGenerationTools(
    { registerTool: (name: string, _config: unknown, handler: never) => handlers.set(name, handler) } as unknown as ToolServer,
    { getApiClient: () => client } as unknown as ToolContext,
  );
  const transform = (extra: Record<string, unknown>) =>
    handlers.get("sirv_image_to_image")?.({ image_url: "https://cdn.test/in.png", prompt: "make it blue", ...extra }) as Promise<{
      structuredContent: { strength: number };
    }>;
  return { bodies, transform };
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

// Zero is a valid strength (the schema allows 0 to 1). The tool must send what
// was asked and report what it sent.
describe("sirv_image_to_image strength", () => {
  for (const strength of [0, 0.4, 1]) {
    it(`sends and reports strength ${strength}`, async () => {
      const { bodies, transform } = await studio();

      const result = await transform({ strength });

      expect(bodies[0].strength).toBe(strength);
      expect(result.structuredContent.strength).toBe(strength);
    });
  }

  it("sends and reports the 0.75 default when no strength is given", async () => {
    const { bodies, transform } = await studio();

    const result = await transform({});

    expect(bodies[0].strength).toBe(0.75);
    expect(result.structuredContent.strength).toBe(0.75);
  });
});
