import { describe, expect, it, vi } from "vitest";
import { registerAssetTools } from "../../tools/assets.js";
import type { ToolContext, ToolServer } from "../../tools/types.js";

function createFakeServer() {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  const server = {
    registerTool: vi.fn((name: string, _config: unknown, handler: (...args: unknown[]) => Promise<unknown>) => {
      handlers.set(name, handler);
      return { name };
    }),
  };

  return {
    handlers,
    server: server as unknown as ToolServer,
  };
}

describe("asset MCP tools", () => {
  it("registers a visual-similarity search tool that returns similar assets", async () => {
    const { handlers, server } = createFakeServer();
    const findSimilarAssets = vi.fn().mockResolvedValue({
      assetId: "asset-1",
      results: [
        {
          asset: {
            filename: "same-look.jpg",
            id: "asset-2",
            mimeType: "image/jpeg",
          },
          score: 0.92,
        },
      ],
      sameOrg: true,
    });
    const context = {
      getApiClient: () => ({ findSimilarAssets }),
    } as unknown as ToolContext;

    registerAssetTools(server, context);

    const result = await handlers.get("sirv_find_similar_assets")?.({
      assetId: "asset-1",
      limit: 8,
      orgId: "org-1",
    });

    expect(findSimilarAssets).toHaveBeenCalledWith("asset-1", {
      limit: 8,
      orgId: "org-1",
    });
    expect((result as { content: { text: string }[] }).content[0].text).toContain("asset-2");
    expect(result).toMatchObject({
      structuredContent: {
        assetId: "asset-1",
        results: [
          {
            asset: {
              id: "asset-2",
            },
            score: 0.92,
          },
        ],
      },
    });
  });
});
