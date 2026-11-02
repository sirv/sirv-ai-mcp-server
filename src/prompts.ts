import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const ask = (text: string) => ({ messages: [{ role: "user" as const, content: { type: "text" as const, text } }] });

// A narrow view of McpServer, like ToolServer: the SDK's own generics hit TS2589 here.
interface PromptServer {
  registerPrompt(
    name: string,
    config: { title: string; description: string; argsSchema: Record<string, z.ZodString> },
    callback: (args: Record<string, string>) => ReturnType<typeof ask>,
  ): unknown;
}

export function registerPrompts(mcpServer: McpServer): void {
  const server = mcpServer as unknown as PromptServer;

  server.registerPrompt(
    "prepare-listing-image",
    {
      title: "Prepare a listing image",
      description: "Remove the background, upscale if small, and write alt text for one library image.",
      argsSchema: { assetId: z.string().describe("Asset ID from sirv_list_assets or sirv_search_assets") },
    },
    ({ assetId }) =>
      ask(`Prepare asset ${assetId} as a product listing image.
1. Call sirv_get_asset with id ${assetId} to get its URL and size.
2. Call sirv_remove_background with that URL.
3. If the long side is under 2000 px, call sirv_upscale on the result.
4. Call sirv_generate_asset_alt_text with id ${assetId}.
Each AI step spends credits. At the end, list the new asset ids and the alt text.`),
  );

  server.registerPrompt(
    "alt-text-sweep",
    {
      title: "Fill in missing alt text",
      description: "Find the images in a folder that have no alt text and write it.",
      argsSchema: { folderId: z.string().describe("Folder ID, or 'root' for the top level") },
    },
    ({ folderId }) =>
      ask(`Fill in missing alt text in folder ${folderId}.
1. Call sirv_list_assets with folderId ${folderId}. Follow the offset hint until you have every page.
2. Keep the images whose altText is empty.
3. Tell the user how many images need alt text. Each one spends credits, so ask before you continue.
4. For each image, call sirv_generate_asset_alt_text with its id.
At the end, report how many images you updated.`),
  );
}
