import { z } from "zod";
import type { ToolRegistrar } from "./types.js";
import { formatError } from "./types.js";
import { toolMeta } from "../openai/meta.js";

const orgId = z.string().uuid().optional().describe("Organization ID (uses default org if omitted)");

const ShopifyStatusSchema = z.object({
  orgId,
}).strict();

const PushImageToShopifySchema = z.object({
  productId: z.string().uuid().describe("Studio product ID of a product imported from Shopify (from sirv_list_products)"),
  assetId: z.string().uuid().describe("Studio asset ID of the image to publish (from sirv_list_assets or sirv_search_assets)"),
  alt_text: z.string().max(512).optional().describe("Alt text for the image"),
  set_as_featured: z.boolean().default(false).describe("Set this image as the featured/main image"),
  idempotencyKey: z.string().uuid().optional().describe("Any UUID. Send the same one when you retry this publish, so Studio does not publish it twice"),
  orgId,
}).strict();

const SyncShopifyProductsSchema = z.object({
  importImages: z.boolean().default(true).describe("Also import product images as assets"),
  orgId,
}).strict();

export const registerShopifyTools: ToolRegistrar = (server, context) => {
  server.registerTool(
    "sirv_shopify_status",
    {
      title: "Check Shopify Connection",
      description: `Check the status of the Shopify store connection.

Validates the access token and returns connection details.

Args:
  - orgId (string, optional): Organization ID

Returns:
  Object with:
  - connected: Whether a store is connected
  - valid: Whether the token is still valid
  - shop: Shop domain
  - shopName: Shop display name
  - needsReconnect: Whether re-auth is needed`,
      inputSchema: ShopifyStatusSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta.shopifyStatus,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const status = await client.getShopifyStatus(params.orgId);

        let text: string;
        if (!status.connected) {
          text = "No Shopify store connected.";
        } else if (!status.valid) {
          text = `Shopify store ${status.shop} is connected but needs re-authentication.`;
        } else {
          text = `Connected to Shopify store: ${status.shopName || status.shop}`;
        }

        return {
          content: [{ type: "text", text }],
          structuredContent: status,
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
    "sirv_push_image_to_shopify",
    {
      title: "Push Image to Shopify",
      description: `Publish a Studio asset to a Shopify product.

Studio creates an approved publish plan and runs it in the background, so the
image reaches Shopify a few seconds after this call returns.

It only adds the image. Replacing the store's images is done in Studio.

If Shopify changed the product since Studio last imported it, the publish fails
with a 409 "Shopify changed this product since it was imported". Run
sirv_sync_shopify_products to re-import the store's products, then retry.

Args:
  - productId (string, required): Studio product ID of a product imported from Shopify
  - assetId (string, required): Studio asset ID of the image
  - alt_text (string, optional): Image alt text
  - set_as_featured (boolean): Set as featured image
  - idempotencyKey (string, optional): A UUID; send the same one on a retry
  - orgId (string, optional): Organization ID

Returns:
  The publish plan ID, the run ID and the run status`,
      inputSchema: PushImageToShopifySchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta.pushImageToShopify,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const { productId, assetId, idempotencyKey, orgId: org, ...data } = params;
        const result = await client.pushImageToShopify(
          productId,
          { asset_id: assetId, ...data },
          org,
          idempotencyKey,
        );

        return {
          content: [{ type: "text", text: `Publishing the image to Shopify (plan ${result.planId}, run ${result.runId}, status ${result.status}).` }],
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
    "sirv_sync_shopify_products",
    {
      title: "Sync Shopify Products",
      description: `Import products and their images from Shopify into the local PIM.

Starts a background import of the whole connected store. Products appear in
Studio while the import runs. Calling it again while an import runs returns
the same run.

Args:
  - importImages (boolean): Also import images as assets (default: true)
  - orgId (string, optional): Organization ID

Returns:
  The import run ID, whether this call started it, and the shop domain`,
      inputSchema: SyncShopifyProductsSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta.syncShopifyProducts,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const { orgId: org, ...options } = params;
        const result = await client.syncShopifyProducts(options, org);

        const text = result.created
          ? `Started a catalog import from ${result.shopDomain} (run ${result.runId}).`
          : `A catalog import from ${result.shopDomain} is already running (run ${result.runId}).`;

        return {
          content: [{ type: "text", text }],
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
};
