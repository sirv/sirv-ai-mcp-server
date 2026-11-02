import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { expect, it } from "vitest";
import { registerAllTools } from "../../tools/index.js";

// OpenAI plugin guidelines: openWorldHint is true for public or open-ended
// entities, such as a caller-supplied URL that the tool fetches, or a write to an
// outside system. A tool confined to the user's own Studio or Sirv workspace is
// false. Every tool is listed, so a new tool fails here until someone picks.
const OPEN_WORLD = {
  sirv_remove_background: true,
  sirv_upscale: true,
  sirv_background_replace: true,
  sirv_object_removal: true,
  sirv_generate: false,
  sirv_image_to_image: true,
  sirv_image_translation: true,
  sirv_video_generation: true,
  sirv_video_upscale: true,
  sirv_alt_text: true,
  sirv_depth_map: true,
  sirv_product_lifestyle: true,
  sirv_virtual_try_on: true,
  sirv_image_to_3d: true,
  sirv_optimize_glb: true,
  sirv_batch_remove_background: true,
  sirv_batch_upscale: true,
  sirv_get_usage: false,
  sirv_list_organizations: false,
  sirv_list_workflows: false,
  sirv_get_workflow: false,
  sirv_list_assets: false,
  sirv_get_asset: false,
  sirv_search_assets: false,
  sirv_find_similar_assets: false,
  sirv_update_asset: false,
  sirv_delete_asset: false,
  sirv_get_asset_metadata: false,
  sirv_update_asset_metadata: false,
  sirv_generate_asset_alt_text: false,
  sirv_bulk_asset_operation: false,
  sirv_import_asset_url: true,
  sirv_list_products: false,
  sirv_get_product: false,
  sirv_create_product: false,
  sirv_update_product: false,
  sirv_delete_product: false,
  sirv_search_products: false,
  sirv_list_products_with_assets: false,
  sirv_link_assets_to_product: false,
  sirv_bulk_product_action: false,
  sirv_shopify_status: false,
  sirv_push_image_to_shopify: true,
  sirv_sync_shopify_products: true,
  sirv_get_supplier_sftp_status: false,
  sirv_get_supplier_review_assist_requirements: false,
  sirv_run_supplier_autofix: true,
  sirv_cdn_search_files: false,
  sirv_cdn_get_file_metadata: false,
  sirv_cdn_manage_folder: false,
  sirv_cdn_upload_from_url: true,
  sirv_cdn_update_file_metadata: false,
  sirv_cdn_update_file_tags: false,
  sirv_cdn_manage_file: false,
};

async function listTools() {
  const server = new McpServer({ name: "test", version: "1.0.0" });
  registerAllTools(server, { getApiClient: () => { throw new Error("not called"); } } as never);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientTransport);

  const { tools } = await client.listTools();
  await client.close();
  return tools;
}

it("every tool states the openWorldHint the directory guidelines call for", async () => {
  const tools = await listTools();

  expect(Object.fromEntries(tools.map((tool) => [tool.name, tool.annotations?.openWorldHint]))).toEqual(OPEN_WORLD);
});

// A tool that overwrites stored fields loses the old values, so the directory
// guidelines call it destructive even when a repeat call is idempotent.
it("tools that overwrite asset or product fields are marked destructive", async () => {
  const tools = await listTools();
  const hints = Object.fromEntries(tools.map((tool) => [tool.name, tool.annotations]));

  for (const name of ["sirv_update_asset", "sirv_update_asset_metadata", "sirv_update_product"]) {
    expect(hints[name], name).toMatchObject({ destructiveHint: true, idempotentHint: true });
  }
});

// The OpenAI directory rejects a generic executor: a workflow runs operations that
// each have their own tool, so workflows run in the Studio app, not through MCP.
it("does not register a workflow executor", async () => {
  const tools = await listTools();

  expect(tools.map((tool) => tool.name)).not.toContain("sirv_execute_workflow");
});
