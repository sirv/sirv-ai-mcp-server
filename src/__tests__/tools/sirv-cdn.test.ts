import { describe, expect, it, vi } from "vitest";
import { registerSirvCdnTools } from "../../tools/sirv-cdn.js";
import type { ToolContext, ToolServer } from "../../tools/types.js";

function register(callSirvCdn: ReturnType<typeof vi.fn>) {
  const handlers = new Map<string, (params: unknown) => Promise<unknown>>();
  const configs = new Map<string, Record<string, unknown>>();
  const server = {
    registerTool: (name: string, config: Record<string, unknown>, handler: (params: unknown) => Promise<unknown>) => {
      configs.set(name, config);
      handlers.set(name, handler);
    },
  } as unknown as ToolServer;
  registerSirvCdnTools(server, { getApiClient: () => ({ callSirvCdn }) } as unknown as ToolContext);
  return { configs, handlers };
}

describe("Sirv CDN MCP tools", () => {
  it("searches the connected Sirv account through the Studio Sirv route", async () => {
    const callSirvCdn = vi.fn().mockResolvedValue({ id: "zap_1", total: 1, results: [{ filename: "/a.jpg" }] });
    const { configs, handlers } = register(callSirvCdn);

    const result = await handlers.get("sirv_cdn_search_files")?.({ query: "basename:a", size: 10, orgId: "org-1" });

    expect(callSirvCdn).toHaveBeenCalledWith("search", { query: "basename:a", size: 10 }, "org-1");
    expect(configs.get("sirv_cdn_search_files")).toMatchObject({ annotations: { readOnlyHint: true } });
    expect(result).toMatchObject({ structuredContent: { total: 1 } });
  });

  it("marks file delete as destructive and reports Studio errors as tool errors", async () => {
    const callSirvCdn = vi.fn().mockRejectedValue(new Error("Sirv account not connected"));
    const { configs, handlers } = register(callSirvCdn);

    const result = await handlers.get("sirv_cdn_manage_file")?.({ action: "delete", file_path: "/a.jpg" });

    expect(configs.get("sirv_cdn_manage_file")).toMatchObject({ annotations: { destructiveHint: true } });
    expect(result).toMatchObject({ isError: true, content: [{ type: "text", text: "Error: Sirv account not connected" }] });
  });
});
