import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { PUBLIC_OPENAPI_TOOL_METADATA } from "../generated/public-openapi-tool-metadata.js";
import type { ToolContext } from "./types.js";

type StudioToolAuthorization = {
  allowed: boolean;
  code?: string;
  error?: string;
};

type ToolHandler = (...args: unknown[]) => Promise<CallToolResult> | CallToolResult;

type RegisterTool = (
  name: string,
  config: Record<string, unknown>,
  handler: ToolHandler,
) => unknown;

const SAFE_READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const PUBLIC_OPENAPI_STUDIO_AUTHORIZATION_TOOL_NAMES = Object.fromEntries(
  Object.entries(PUBLIC_OPENAPI_TOOL_METADATA)
    .filter(([, metadata]) => !SAFE_READ_METHODS.has(metadata.method.toUpperCase()))
    .map(([toolName]) => [toolName, toolName] as const),
) as Readonly<Record<string, string>>;

const STUDIO_AUTHORIZATION_TOOL_NAMES: Readonly<Record<string, string>> = {
  ...PUBLIC_OPENAPI_STUDIO_AUTHORIZATION_TOOL_NAMES,
  "asset.visual_similarity.search": "asset.visual_similarity.search",
  "supplier.sftp.ingest": "supplier.sftp.ingest",
  sirv_find_similar_assets: "sirv_find_similar_assets",
  sirv_get_supplier_sftp_status: "sirv_get_supplier_sftp_status",
  sirv_push_image_to_shopify: "sirv_push_image_to_shopify",
  sirv_run_supplier_autofix: "sirv_run_supplier_autofix",
  sirv_sync_shopify_products: "sirv_sync_shopify_products",
  sirv_batch_remove_background: "sirv_batch_remove_background",
  sirv_batch_upscale: "sirv_batch_upscale",
  supplier_sftp_ingest: "supplier_sftp_ingest",
  visual_similarity_search: "visual_similarity_search",
};

export function getStudioAuthorizationToolName(toolName: string): string | null {
  if (!Object.hasOwn(STUDIO_AUTHORIZATION_TOOL_NAMES, toolName)) {
    return null;
  }

  return STUDIO_AUTHORIZATION_TOOL_NAMES[toolName] ?? null;
}

function authorizationDeniedResult(
  authorization: StudioToolAuthorization,
): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: `Error: ${authorization.error ?? "MCP tool is not authorised for this workspace."}`,
      },
    ],
    isError: true,
    structuredContent: {
      success: false,
      code: authorization.code ?? "MCP_TOOL_NOT_AUTHORIZED",
    },
  };
}

function authorizationFailedResult(): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: "Error: MCP tool authorization failed.",
      },
    ],
    isError: true,
    structuredContent: {
      success: false,
      code: "MCP_TOOL_AUTHORIZATION_FAILED",
    },
  };
}

export function installToolAuthorization(
  server: McpServer,
  context: ToolContext,
): void {
  const mutableServer = server as unknown as { registerTool: RegisterTool };
  const registerTool = mutableServer.registerTool.bind(server);

  mutableServer.registerTool = (name, config, handler) =>
    registerTool(name, config, async (...args: unknown[]) => {
      const studioToolName = getStudioAuthorizationToolName(name);
      if (!studioToolName) {
        return handler(...args);
      }

      try {
        const authorization = await context.getApiClient().authorizeTool(studioToolName);
        if (!authorization.allowed) {
          return authorizationDeniedResult(authorization);
        }
      } catch {
        return authorizationFailedResult();
      }

      return handler(...args);
    });
}
