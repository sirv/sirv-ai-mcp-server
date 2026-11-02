import { z } from "zod";
import type { ToolRegistrar } from "./types.js";
import { formatError } from "./types.js";
import { PUBLIC_OPENAPI_TOOL_METADATA } from "../generated/public-openapi-tool-metadata.js";
import { toolMeta } from "../openai/meta.js";

const orgId = z.string().uuid().optional().describe("Organization ID (uses default org if omitted)");

const ListAssetsSchema = z.object({
  search: z.string().optional().describe("Filter assets by filename search"),
  favorite: z.boolean().optional().describe("Filter by favorite status"),
  tags: z.string().optional().describe("Comma-separated tag IDs to filter by"),
  folderId: z.string().optional().describe("Filter by folder ID ('root' for root level)"),
  productId: z.string().optional().describe("Filter by linked product ID"),
  sortBy: z.enum(["created_at", "filename"]).default("created_at").describe("Sort field"),
  sortOrder: z.enum(["asc", "desc"]).default("desc").describe("Sort direction"),
  limit: z.number().int().min(1).max(100).default(20).describe("Number of results"),
  offset: z.number().int().min(0).default(0).describe("Pagination offset"),
  orgId,
}).strict();

const GetAssetSchema = z.object({
  id: z.string().describe("Asset ID"),
  orgId,
}).strict();

const SearchAssetsSchema = z.object({
  q: z.string().min(1).describe("Full-text search query"),
  limit: z.number().int().min(1).max(50).default(20).describe("Number of results"),
  offset: z.number().int().min(0).default(0).describe("Pagination offset"),
  mimeType: z.string().optional().describe("Filter by MIME type (e.g. 'image/png')"),
  sourceTool: z.string().optional().describe("Filter by source tool"),
  isFavorite: z.boolean().optional().describe("Filter by favorite status"),
  orgId,
}).strict();

const FindSimilarAssetsSchema = z.object({
  assetId: z.string().describe("Asset ID to use as the visual search seed"),
  limit: z.number().int().min(1).max(50).default(20).describe("Number of visually similar assets to return"),
  orgId,
}).strict();

const UpdateAssetSchema = z.object({
  id: z.string().describe("Asset ID"),
  filename: z.string().optional().describe("New filename"),
  altText: z.string().optional().describe("New alt text"),
  isFavorite: z.boolean().optional().describe("Favorite status"),
  orgId,
}).strict();

const DeleteAssetSchema = z.object({
  id: z.string().describe("Asset ID to soft-delete"),
  orgId,
}).strict();

const GetAssetMetadataSchema = z.object({
  id: z.string().describe("Asset ID"),
  orgId,
}).strict();

const UpdateAssetMetadataSchema = z.object({
  id: z.string().describe("Asset ID"),
  metadata: z.record(z.object({
    value: z.unknown().default(null),
    type: z.string(),
  })).describe("Metadata fields to set or update"),
  templateId: z.string().nullable().optional().describe("Metadata template ID to apply"),
  orgId,
}).strict();

const GenerateAssetAltTextSchema = z.object({
  id: z.string().describe("Asset ID"),
  detailLevel: z.enum(["caption", "detailed-caption", "more-detailed-caption"]).default("caption").describe("Level of detail for the generated alt text"),
  model: z.string().optional().describe("AI model to use (default: florence)"),
  orgId,
}).strict();

const BulkAssetOperationSchema = z.object({
  assetIds: z.array(z.string()).min(1).max(500).describe("Asset IDs to operate on"),
  operation: z.enum(["favorite", "unfavorite", "delete", "restore", "addTags", "removeTags", "moveToFolder", "copyToFolder"]).describe("Bulk operation to perform"),
  tagIds: z.array(z.string()).optional().describe("Tag IDs (required for addTags/removeTags)"),
  folderId: z.string().nullable().optional().describe("Target folder ID (for moveToFolder/copyToFolder, null for root)"),
  orgId,
}).strict();

const ImportAssetUrlSchema = z.object({
  url: z.string().url().describe("External URL to import"),
  filename: z.string().describe("Filename for the imported asset (with extension)"),
  fileSize: z.number().int().optional().describe("File size in bytes"),
  orgId,
}).strict();

export const registerAssetTools: ToolRegistrar = (server, context) => {
  server.registerTool(
    "sirv_list_assets",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_list_assets.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_list_assets.description,
      inputSchema: ListAssetsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta.listAssets,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const result = await client.listAssets(params);

        const summary = result.assets.map((a) =>
          `- ${a.filename || "Untitled"} (${a.mimeType || "unknown"}) ${a.isFavorite ? "[fav]" : ""}`
        ).join("\n");

        return {
          content: [{ type: "text", text: `Found ${result.total} assets.\n\n${summary}` }],
          structuredContent: result,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${formatError(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "sirv_get_asset",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_get_asset.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_get_asset.description,
      inputSchema: GetAssetSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta.getAsset,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const asset = await client.getAsset(params.id, params.orgId);

        const text = [
          `Filename: ${asset.filename || "Untitled"}`,
          `URL: ${asset.url}`,
          `Type: ${asset.mimeType || "unknown"}`,
          asset.width && asset.height ? `Dimensions: ${asset.width}x${asset.height}` : null,
          asset.fileSize ? `Size: ${(asset.fileSize / 1024).toFixed(1)} KB` : null,
          asset.altText ? `Alt text: ${asset.altText}` : null,
          `Favorite: ${asset.isFavorite}`,
        ].filter(Boolean).join("\n");

        return {
          content: [{ type: "text", text }],
          structuredContent: asset,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${formatError(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "sirv_search_assets",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_search_assets.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_search_assets.description,
      inputSchema: SearchAssetsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta.searchAssets,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const result = await client.searchAssets(params);

        const summary = result.hits.map((h) =>
          `- ${h.filename || "Untitled"} (${h.mimeType || "unknown"}) ${h.isFavorite ? "[fav]" : ""}`
        ).join("\n");

        return {
          content: [{ type: "text", text: `Found ${result.total} results for "${result.query}".\n\n${summary}` }],
          structuredContent: result,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${formatError(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "sirv_find_similar_assets",
    {
      title: "Find Similar Assets",
      description: `Find visually similar assets for a selected DAM asset.

Uses Studio's visual-similarity index to return assets that look like the seed asset.
This requires visual similarity access for the workspace.

Args:
  - assetId (string, required): Asset ID to use as the visual search seed
  - limit (number): Results per page (max 50)
  - orgId (string, optional): Organization ID

Returns:
  Ranked visual matches with asset details and similarity scores`,
      inputSchema: FindSimilarAssetsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta.findSimilarAssets,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const result = await client.findSimilarAssets(params.assetId, {
          limit: params.limit,
          orgId: params.orgId,
        });

        const count = result.results.length;
        const summary = result.results.map((match) => {
          const filename = match.asset.filename || "Untitled";
          const mimeType = match.asset.mimeType || "unknown";
          return `- ${filename} (${mimeType}) score ${match.score.toFixed(2)}`;
        }).join("\n");

        return {
          content: [
            {
              type: "text",
              text: count > 0
                ? `Found ${count} visually similar ${count === 1 ? "asset" : "assets"} for "${result.assetId}".\n\n${summary}`
                : `No visually similar assets found for "${result.assetId}".`,
            },
          ],
          structuredContent: result,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${formatError(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "sirv_update_asset",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_update_asset.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_update_asset.description,
      inputSchema: UpdateAssetSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta.updateAsset,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const { id, orgId: org, ...updates } = params;
        const asset = await client.updateAsset(id, updates, org);

        return {
          content: [{ type: "text", text: `Asset "${asset.filename || id}" updated.` }],
          structuredContent: { success: true, asset },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${formatError(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "sirv_delete_asset",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_delete_asset.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_delete_asset.description,
      inputSchema: DeleteAssetSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta.deleteAsset,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        await client.deleteAsset(params.id, params.orgId);

        return {
          content: [{ type: "text", text: `Asset ${params.id} deleted (soft-delete, can be restored).` }],
          structuredContent: { success: true, id: params.id },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${formatError(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "sirv_get_asset_metadata",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_get_asset_metadata.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_get_asset_metadata.description,
      inputSchema: GetAssetMetadataSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta.getAssetMetadata,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const result = await client.getAssetMetadata(params.id, params.orgId);

        const fields = Object.entries(result.metadata);
        const text = fields.length > 0
          ? fields.map(([key, val]) => `- ${key}: ${JSON.stringify(val.value)} (${val.type})`).join("\n")
          : "No custom metadata set.";

        return {
          content: [{ type: "text", text: result.templateId ? `Template: ${result.templateId}\n\n${text}` : text }],
          structuredContent: result,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${formatError(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "sirv_update_asset_metadata",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_update_asset_metadata.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_update_asset_metadata.description,
      inputSchema: UpdateAssetMetadataSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta.updateAssetMetadata,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const { id, metadata, templateId, orgId: org } = params;
        const normalizedMetadata: Record<string, { value: unknown; type: string }> = {};
        for (const [key, entry] of Object.entries(metadata)) {
          normalizedMetadata[key] = { value: entry.value ?? null, type: entry.type };
        }
        const result = await client.updateAssetMetadata(id, { metadata: normalizedMetadata, templateId }, org);

        return {
          content: [{ type: "text", text: `Metadata updated for asset ${id}.` }],
          structuredContent: { success: true, ...result },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${formatError(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "sirv_generate_asset_alt_text",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_generate_asset_alt_text.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_generate_asset_alt_text.description,
      inputSchema: GenerateAssetAltTextSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      _meta: toolMeta.generateAssetAltText,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const { id, orgId: org, ...options } = params;
        const result = await client.generateAssetAltText(id, options, org);

        return {
          content: [{ type: "text", text: `Alt text generated: "${result.altText}"` }],
          structuredContent: { success: true, ...result },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${formatError(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "sirv_bulk_asset_operation",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_bulk_asset_operation.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_bulk_asset_operation.description,
      inputSchema: BulkAssetOperationSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      _meta: toolMeta.bulkAssetOperation,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const { orgId: org, ...data } = params;
        const result = await client.bulkAssetOperation(data, org);

        return {
          content: [{ type: "text", text: `Bulk ${params.operation}: ${result.count} assets affected.` }],
          structuredContent: result,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${formatError(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "sirv_import_asset_url",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_import_asset_url.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_import_asset_url.description,
      inputSchema: ImportAssetUrlSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta.importAssetUrl,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const { orgId: org, ...data } = params;
        const asset = await client.importAssetUrl(data, org);

        return {
          content: [{ type: "text", text: `Imported "${params.filename}" successfully.\n\nURL: ${asset.url}` }],
          structuredContent: { success: true, asset },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${formatError(error)}` }],
          isError: true,
        };
      }
    }
  );
};
