import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../tools/types.js";
import {
  getStudioAuthorizationToolName,
  installToolAuthorization,
} from "../../tools/authorization.js";

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
    server: server as unknown as McpServer,
  };
}

function createContext(authorizeTool = vi.fn()) {
  return {
    authorizeTool,
    context: {
      getApiClient: () => ({ authorizeTool }),
    } as unknown as ToolContext,
  };
}

describe("MCP tool authorization", () => {
  it.each([
    ["sirv_find_similar_assets", "sirv_find_similar_assets"],
    ["supplier_sftp_ingest", "supplier_sftp_ingest"],
    ["sirv_run_supplier_autofix", "sirv_run_supplier_autofix"],
    ["sirv_get_supplier_sftp_status", "sirv_get_supplier_sftp_status"],
    ["sirv_push_image_to_shopify", "sirv_push_image_to_shopify"],
    ["sirv_sync_shopify_products", "sirv_sync_shopify_products"],
    ["sirv_batch_remove_background", "sirv_batch_remove_background"],
    ["sirv_batch_upscale", "sirv_batch_upscale"],
    ["sirv_update_asset", "sirv_update_asset"],
    ["sirv_delete_asset", "sirv_delete_asset"],
    ["sirv_update_asset_metadata", "sirv_update_asset_metadata"],
    ["sirv_generate_asset_alt_text", "sirv_generate_asset_alt_text"],
    ["sirv_bulk_asset_operation", "sirv_bulk_asset_operation"],
    ["sirv_import_asset_url", "sirv_import_asset_url"],
    ["sirv_create_product", "sirv_create_product"],
    ["sirv_update_product", "sirv_update_product"],
    ["sirv_delete_product", "sirv_delete_product"],
    ["sirv_link_assets_to_product", "sirv_link_assets_to_product"],
    ["sirv_bulk_product_action", "sirv_bulk_product_action"],
    ["sirv_remove_background", "sirv_remove_background"],
    ["sirv_upscale", "sirv_upscale"],
    ["sirv_background_replace", "sirv_background_replace"],
    ["sirv_object_removal", "sirv_object_removal"],
    ["sirv_generate", "sirv_generate"],
    ["sirv_image_to_image", "sirv_image_to_image"],
    ["sirv_image_translation", "sirv_image_translation"],
    ["sirv_video_generation", "sirv_video_generation"],
    ["sirv_alt_text", "sirv_alt_text"],
    ["sirv_depth_map", "sirv_depth_map"],
    ["sirv_product_lifestyle", "sirv_product_lifestyle"],
    ["sirv_virtual_try_on", "sirv_virtual_try_on"],
    ["sirv_image_to_3d", "sirv_image_to_3d"],
    ["sirv_optimize_glb", "sirv_optimize_glb"],
  ])("maps gated MCP tool %s to Studio authorization name %s", (toolName, expected) => {
    expect(getStudioAuthorizationToolName(toolName)).toBe(expected);
  });

  it.each([
    "sirv_list_assets",
    "sirv_get_asset",
    "sirv_search_assets",
    "sirv_get_asset_metadata",
    "sirv_list_products",
    "sirv_get_product",
    "sirv_search_products",
    "sirv_list_products_with_assets",
    "sirv_get_usage",
    "sirv_list_organizations",
    "sirv_list_workflows",
    "sirv_get_workflow",
    "sirv_get_supplier_review_assist_requirements",
  ])("keeps preview-readable MCP tool %s out of tool-specific authorization", (toolName) => {
    expect(getStudioAuthorizationToolName(toolName)).toBeNull();
  });

  it("authorizes a gated tool before executing its handler", async () => {
    const { handlers, server } = createFakeServer();
    const { authorizeTool, context } = createContext(
      vi.fn().mockResolvedValue({ allowed: true }),
    );
    installToolAuthorization(server, context);

    server.registerTool("sirv_find_similar_assets", {}, async () => ({
      content: [{ type: "text", text: "similar assets" }],
    }));

    const result = await handlers.get("sirv_find_similar_assets")?.({});

    expect(authorizeTool).toHaveBeenCalledWith("sirv_find_similar_assets");
    expect(result).toEqual({
      content: [{ type: "text", text: "similar assets" }],
    });
  });

  it("returns an MCP error and skips the handler when Studio denies a gated tool", async () => {
    const { handlers, server } = createFakeServer();
    const handler = vi.fn();
    const { authorizeTool, context } = createContext(
      vi.fn().mockResolvedValue({
        allowed: false,
        code: "VISUAL_SIMILARITY_NOT_AVAILABLE",
        error: "Visual similarity is not available for this workspace.",
      }),
    );
    installToolAuthorization(server, context);

    server.registerTool("sirv_find_similar_assets", {}, handler);

    const result = await handlers.get("sirv_find_similar_assets")?.({});

    expect(authorizeTool).toHaveBeenCalledWith("sirv_find_similar_assets");
    expect(handler).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      content: [
        {
          text: "Error: Visual similarity is not available for this workspace.",
          type: "text",
        },
      ],
      isError: true,
      structuredContent: {
        code: "VISUAL_SIMILARITY_NOT_AVAILABLE",
        success: false,
      },
    });
  });

  it("fails closed when Studio authorization cannot be reached", async () => {
    const { handlers, server } = createFakeServer();
    const handler = vi.fn();
    const { authorizeTool, context } = createContext(
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    installToolAuthorization(server, context);

    server.registerTool("sirv_run_supplier_autofix", {}, handler);

    const result = await handlers.get("sirv_run_supplier_autofix")?.({});

    expect(authorizeTool).toHaveBeenCalledWith("sirv_run_supplier_autofix");
    expect(handler).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      content: [{ text: "Error: MCP tool authorization failed.", type: "text" }],
      isError: true,
      structuredContent: {
        code: "MCP_TOOL_AUTHORIZATION_FAILED",
        success: false,
      },
    });
  });

  it("does not call Studio authorization for ordinary ungated tools", async () => {
    const { handlers, server } = createFakeServer();
    const handler = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "assets" }],
    });
    const { authorizeTool, context } = createContext(
      vi.fn().mockResolvedValue({ allowed: true }),
    );
    installToolAuthorization(server, context);

    server.registerTool("sirv_list_assets", {}, handler);

    const result = await handlers.get("sirv_list_assets")?.({});

    expect(authorizeTool).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalled();
    expect(result).toEqual({
      content: [{ type: "text", text: "assets" }],
    });
  });
});
