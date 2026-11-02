import { z } from "zod";
import type { ToolRegistrar } from "./types.js";
import { formatError } from "./types.js";
import { PUBLIC_OPENAPI_TOOL_METADATA } from "../generated/public-openapi-tool-metadata.js";
import { toolMeta } from "../openai/meta.js";

const orgId = z.string().uuid().optional().describe("Organization ID (uses default org if omitted)");

const ListProductsSchema = z.object({
  search: z.string().optional().describe("Search by name or SKU"),
  status: z.enum(["active", "draft", "archived"]).optional().describe("Filter by status"),
  externalSource: z.enum(["shopify", "woocommerce", "manual", "csv"]).optional().describe("Filter by source"),
  limit: z.number().int().min(1).max(100).default(20).describe("Number of results"),
  offset: z.number().int().min(0).default(0).describe("Pagination offset"),
  sortBy: z.enum(["createdAt", "name", "sku", "updatedAt"]).default("createdAt").describe("Sort field"),
  sortOrder: z.enum(["asc", "desc"]).default("desc").describe("Sort direction"),
  orgId,
}).strict();

const GetProductSchema = z.object({
  id: z.string().describe("Product ID"),
  orgId,
}).strict();

const CreateProductSchema = z.object({
  sku: z.string().min(1).max(100).describe("Product SKU (unique identifier)"),
  name: z.string().min(1).max(255).describe("Product name"),
  description: z.string().max(5000).optional().describe("Product description"),
  status: z.enum(["active", "draft", "archived"]).default("active").describe("Product status"),
  externalId: z.string().max(255).optional().describe("External system ID"),
  externalSource: z.enum(["shopify", "woocommerce", "manual", "csv"]).optional().describe("External source"),
  externalUrl: z.string().url().max(2000).optional().describe("External product URL"),
  orgId,
}).strict();

const UpdateProductSchema = z.object({
  id: z.string().describe("Product ID"),
  sku: z.string().min(1).max(100).optional().describe("New SKU"),
  name: z.string().min(1).max(255).optional().describe("New name"),
  description: z.string().max(5000).nullable().optional().describe("New description (null to clear)"),
  status: z.enum(["active", "draft", "archived"]).optional().describe("New status"),
  brand: z.string().max(255).nullable().optional().describe("Brand (null to clear)"),
  productCategory: z.string().max(255).nullable().optional().describe("Category (null to clear)"),
  productType: z.string().max(255).nullable().optional().describe("Product type (null to clear)"),
  tags: z.array(z.string().max(100)).max(50).optional().describe("Tags array"),
  orgId,
}).strict();

const DeleteProductSchema = z.object({
  id: z.string().describe("Product ID to delete"),
  orgId,
}).strict();

const SearchProductsSchema = z.object({
  q: z.string().min(1).max(100).describe("Search query (matches name and SKU)"),
  limit: z.number().int().min(1).max(50).optional().describe("Max results"),
  orgId,
}).strict();

const ListProductsWithAssetsSchema = z.object({
  search: z.string().optional().describe("Search by name or SKU"),
  limit: z.number().int().min(1).max(100).default(20).describe("Number of results"),
  offset: z.number().int().min(0).default(0).describe("Pagination offset"),
  sortBy: z.enum(["name", "createdAt", "assetCount"]).default("name").describe("Sort field"),
  sortOrder: z.enum(["asc", "desc"]).default("asc").describe("Sort direction"),
  hideEmpty: z.boolean().default(true).describe("Hide products with no assets"),
  orgId,
}).strict();

const LinkAssetsToProductSchema = z.object({
  productId: z.string().describe("Product ID"),
  assetIds: z.array(z.string()).min(1).max(100).describe("Asset IDs to link"),
  role: z.enum(["main", "gallery", "lifestyle", "detail", "swatch"]).optional().describe("Asset role"),
  orgId,
}).strict();

// Product deletes are permanent (products have no trash), so an agent gets no
// deleteAll and at most MAX_PRODUCT_DELETES_PER_CALL per call. People delete
// more from Studio.
const MAX_PRODUCT_DELETES_PER_CALL = 25;

const BulkProductActionSchema = z.object({
  action: z.enum(["delete", "updateStatus", "linkAssets", "updateFields"]).describe("Bulk action to perform"),
  productIds: z.array(z.string()).optional().describe(`Product IDs (at most ${MAX_PRODUCT_DELETES_PER_CALL} for delete)`),
  status: z.enum(["active", "draft", "archived"]).optional().describe("New status (for updateStatus)"),
  assetIds: z.array(z.string()).optional().describe("Asset IDs (for linkAssets)"),
  role: z.enum(["main", "gallery", "swatch", "lifestyle", "detail"]).optional().describe("Asset role (for linkAssets)"),
  fields: z.object({
    brand: z.string().nullable().optional(),
    productCategory: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    status: z.enum(["active", "draft", "archived"]).optional(),
    tags: z.array(z.string()).optional(),
  }).optional().describe("Fields to update (for updateFields)"),
  tagMode: z.enum(["merge", "replace"]).default("merge").describe("How to handle tags in updateFields"),
  orgId,
}).strict();

export const registerProductManagementTools: ToolRegistrar = (server, context) => {
  server.registerTool(
    "sirv_list_products",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_list_products.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_list_products.description,
      inputSchema: ListProductsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta.listProducts,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const result = await client.listProducts(params);

        const summary = result.products.map((p) =>
          `- ${p.name} (SKU: ${p.sku}) [${p.status}]`
        ).join("\n");

        return {
          content: [{ type: "text", text: `Found ${result.total} products.\n\n${summary}` }],
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
    "sirv_get_product",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_get_product.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_get_product.description,
      inputSchema: GetProductSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta.getProduct,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const product = await client.getProduct(params.id, params.orgId);

        const text = [
          `Name: ${product.name}`,
          `SKU: ${product.sku}`,
          `Status: ${product.status}`,
          product.description ? `Description: ${product.description}` : null,
          product.brand ? `Brand: ${product.brand}` : null,
          product.externalSource ? `Source: ${product.externalSource}` : null,
          product.externalUrl ? `URL: ${product.externalUrl}` : null,
        ].filter(Boolean).join("\n");

        return {
          content: [{ type: "text", text }],
          structuredContent: product,
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
    "sirv_create_product",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_create_product.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_create_product.description,
      inputSchema: CreateProductSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      _meta: toolMeta.createProduct,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const { orgId: org, ...data } = params;
        const product = await client.createProduct(data, org);

        return {
          content: [{ type: "text", text: `Product "${product.name}" created (ID: ${product.id}).` }],
          structuredContent: { success: true, product },
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
    "sirv_update_product",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_update_product.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_update_product.description,
      inputSchema: UpdateProductSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta.updateProduct,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const { id, orgId: org, ...updates } = params;
        const product = await client.updateProduct(id, updates, org);

        return {
          content: [{ type: "text", text: `Product "${product.name}" updated.` }],
          structuredContent: { success: true, product },
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
    "sirv_delete_product",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_delete_product.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_delete_product.description,
      inputSchema: DeleteProductSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta.deleteProduct,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        await client.deleteProduct(params.id, params.orgId);

        return {
          content: [{ type: "text", text: `Product ${params.id} deleted.` }],
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
    "sirv_search_products",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_search_products.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_search_products.description,
      inputSchema: SearchProductsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta.searchProducts,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const result = await client.searchProducts(params);

        const summary = result.products.map((p) =>
          `- ${p.name} (SKU: ${p.sku}) [${p.status}]`
        ).join("\n");

        return {
          content: [{ type: "text", text: `Found ${result.products.length} products.\n\n${summary}` }],
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
    "sirv_list_products_with_assets",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_list_products_with_assets.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_list_products_with_assets.description,
      inputSchema: ListProductsWithAssetsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta.listProductsWithAssets,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const result = await client.listProductsWithAssets(params);

        const summary = result.products.map((p) =>
          `- ${p.name} (${p.assetCount} assets) [${p.status}]`
        ).join("\n");

        return {
          content: [{ type: "text", text: `Found ${result.total} products.\n\n${summary}` }],
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
    "sirv_link_assets_to_product",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_link_assets_to_product.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_link_assets_to_product.description,
      inputSchema: LinkAssetsToProductSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta.linkAssetsToProduct,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const { productId, orgId: org, ...data } = params;
        const result = await client.linkAssetsToProduct(productId, data, org);

        return {
          content: [{ type: "text", text: `Linked ${result.linked} asset(s) to product.` }],
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
    "sirv_bulk_product_action",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_bulk_product_action.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_bulk_product_action.description,
      inputSchema: BulkProductActionSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      _meta: toolMeta.bulkProductAction,
    },
    async (params) => {
      if (params.action === "delete" && (params.productIds?.length ?? 0) > MAX_PRODUCT_DELETES_PER_CALL) {
        return {
          content: [{ type: "text", text: `Error: Delete at most ${MAX_PRODUCT_DELETES_PER_CALL} products per call. Product deletes cannot be undone.` }],
          isError: true,
        };
      }
      try {
        const client = context.getApiClient();
        const { orgId: org, ...data } = params;
        const result = await client.bulkProductAction(data as Record<string, unknown>, org);

        return {
          content: [{ type: "text", text: `Bulk ${params.action} completed.` }],
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
};
