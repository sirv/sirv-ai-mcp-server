import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SERVER_VERSION } from "./constants.js";
import { registerPrompts } from "./prompts.js";
import { registerAllTools } from "./tools/index.js";
import type { ToolContext } from "./tools/types.js";

const INSTRUCTIONS = `Sirv AI Studio tools work on the user's Studio workspace.
- Image and video tools take a public file URL. To use a library file, find it with sirv_search_assets or sirv_list_assets and pass its url.
- AI tools spend credits. Call sirv_get_usage to check the balance before a large batch.
- List tools return ids and take limit and offset for paging.
- Every tool takes an optional orgId. Without it, the user's default organization is used.`;

export function createMcpServer(context: ToolContext): McpServer {
  const server = new McpServer(
    { name: "sirv-ai-mcp-server", version: SERVER_VERSION },
    // Well above a 500-asset bulk call; reject large records before schema validation.
    { instructions: INSTRUCTIONS, maxToolInputElements: 10_000 },
  );
  registerAllTools(server, context);
  registerPrompts(server);
  return server;
}
