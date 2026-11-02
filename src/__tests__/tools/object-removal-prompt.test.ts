import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { SirvApiClient } from "../../api-client.js";
import { registerImageProcessingTools } from "../../tools/image-processing.js";
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
  registerImageProcessingTools(
    { registerTool: (name: string, _config: unknown, handler: never) => handlers.set(name, handler) } as unknown as ToolServer,
    { getApiClient: () => client } as unknown as ToolContext,
  );
  const edit = (extra: Record<string, unknown>) =>
    handlers.get("sirv_object_removal")?.({ image_url: "https://cdn.test/in.png", mask_url: "https://cdn.test/mask.png", ...extra }) as Promise<{
      isError?: boolean;
    }>;
  return { bodies, edit };
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

// The tool says it can fill a masked area from a prompt. Studio drops the prompt
// unless the request asks for fill mode, so a prompt must travel with mode "fill".
describe("sirv_object_removal prompt", () => {
  it("sends the prompt in fill mode", async () => {
    const { bodies, edit } = await studio();

    const result = await edit({ prompt: "a red vase" });

    expect(result.isError).toBeUndefined();
    expect(bodies[0]).toMatchObject({ prompt: "a red vase", mode: "fill" });
  });

  it("sends a plain removal when no prompt is given", async () => {
    const { bodies, edit } = await studio();

    await edit({});

    expect(bodies[0]).not.toHaveProperty("prompt");
    expect(bodies[0]).not.toHaveProperty("mode");
  });
});
