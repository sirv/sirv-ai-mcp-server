import { describe, expect, it, vi } from "vitest";
import { PUBLIC_OPENAPI_TOOL_METADATA } from "../../generated/public-openapi-tool-metadata.js";
import { registerGenerationTools } from "../../tools/generation.js";
import type { ToolContext, ToolServer } from "../../tools/types.js";

function createFakeServer() {
  const configs = new Map<string, Record<string, unknown>>();
  const handlers = new Map<string, (params: Record<string, unknown>) => Promise<unknown>>();
  const server = {
    registerTool: vi.fn(
      (
        name: string,
        config: Record<string, unknown>,
        handler: (params: Record<string, unknown>) => Promise<unknown>,
      ) => {
        configs.set(name, config);
        handlers.set(name, handler);
        return { name };
      },
    ),
  };

  return {
    configs,
    handlers,
    server: server as unknown as ToolServer,
  };
}

describe("generation MCP tools", () => {
  it("registers video upscale with generated metadata and maps request params to the API client", async () => {
    const { configs, handlers, server } = createFakeServer();
    const videoUpscale = vi.fn().mockResolvedValue("https://cdn.test/upscaled.mp4");
    const context = {
      getApiClient: () => ({ videoUpscale }),
    } as unknown as ToolContext;

    registerGenerationTools(server, context);

    const metadata = PUBLIC_OPENAPI_TOOL_METADATA.sirv_video_upscale;
    expect(configs.get("sirv_video_upscale"), "sirv_video_upscale should be registered").toMatchObject({
      description: metadata.description,
      title: metadata.title,
    });

    const handler = handlers.get("sirv_video_upscale");
    expect(handler, "sirv_video_upscale handler should be registered").toBeDefined();

    await handler?.({
      video_url: "https://cdn.test/source.mp4",
      model: "topaz-video",
      scale: 4,
      target_resolution: "2160p",
      source_width: 1920,
      source_height: 1080,
      source_duration_seconds: 12.5,
      source_frame_rate: 29.97,
    });

    expect(videoUpscale).toHaveBeenCalledWith("https://cdn.test/source.mp4", {
      model: "topaz-video",
      scale: 4,
      targetResolution: "2160p",
      sourceWidth: 1920,
      sourceHeight: 1080,
      sourceDurationSeconds: 12.5,
      sourceFrameRate: 29.97,
    });
  });
});
