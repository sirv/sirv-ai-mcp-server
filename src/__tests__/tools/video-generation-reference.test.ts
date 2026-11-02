import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it } from "vitest";
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
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ video: { url: "https://cdn.test/out.mp4" } }));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const client = new SirvApiClient(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, { kind: "apiKey", apiKey: "sk_live_test" });
  const handlers = new Map<string, (params: Record<string, unknown>) => Promise<unknown>>();
  const configs = new Map<string, { inputSchema: { safeParse: (input: unknown) => { success: boolean } } }>();
  registerGenerationTools(
    {
      registerTool: (name: string, config: never, handler: never) => {
        configs.set(name, config);
        handlers.set(name, handler);
      },
    } as unknown as ToolServer,
    { getApiClient: () => client } as unknown as ToolContext,
  );
  return { bodies, handler: handlers.get("sirv_video_generation"), schema: configs.get("sirv_video_generation")?.inputSchema };
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

const referenceCall = {
  prompt: "the bag turns on a table",
  model: "veo31ref",
  image_urls: ["https://cdn.test/front.png", "https://cdn.test/side.png"],
};

// The tool description promises that veo31ref takes reference images in image_urls.
it("sends veo31ref with its reference images", async () => {
  const { bodies, handler, schema } = await studio();

  expect(schema?.safeParse(referenceCall).success).toBe(true);
  await handler?.(referenceCall);

  expect(bodies[0]).toMatchObject({ model: "veo31ref", image_urls: referenceCall.image_urls });
});

it("refuses more than five reference images", async () => {
  const { schema } = await studio();

  const urls = Array.from({ length: 6 }, (_, i) => `https://cdn.test/${i}.png`);

  expect(schema?.safeParse({ ...referenceCall, image_urls: urls }).success).toBe(false);
});
