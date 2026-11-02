import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext, ToolServer } from "./types.js";
import { registerImageProcessingTools } from "./image-processing.js";
import { registerGenerationTools } from "./generation.js";
import { registerAnalysisTools } from "./analysis.js";
import { registerProductTools } from "./product.js";
import { registerBatchTools } from "./batch.js";
import { registerAccountTools } from "./account.js";
import { registerWidgetResource } from "../openai/widget-resource.js";
import { registerWorkflowTools } from "./workflows.js";
import { registerAssetTools } from "./assets.js";
import { registerProductManagementTools } from "./product-management.js";
import { registerShopifyTools } from "./shopify.js";
import { registerSupplierPortalTools } from "./supplier-portal.js";
import { registerSirvCdnTools } from "./sirv-cdn.js";
import { installToolAuthorization } from "./authorization.js";

export type { ToolContext, ToolRegistrar, ToolServer } from "./types.js";
export { formatError, truncateIfNeeded } from "./types.js";

/**
 * Register all MCP tools with the server
 */
export function registerAllTools(server: McpServer, context: ToolContext): void {
  installToolAuthorization(server, context);

  // MCP Apps widget for image-result tools
  registerWidgetResource(server, process.env.MCP_BASE_URL);

  const toolServer = server as unknown as ToolServer;

  // AI image processing tools
  registerImageProcessingTools(toolServer, context);
  registerGenerationTools(toolServer, context);
  registerAnalysisTools(toolServer, context);
  registerProductTools(toolServer, context);
  registerBatchTools(toolServer, context);
  registerAccountTools(toolServer, context);
  registerWorkflowTools(toolServer, context);

  // DAM, PIM, and integrations
  registerAssetTools(toolServer, context);
  registerProductManagementTools(toolServer, context);
  registerShopifyTools(toolServer, context);
  registerSupplierPortalTools(toolServer, context);
  registerSirvCdnTools(toolServer, context);
}
