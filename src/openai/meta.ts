/**
 * OpenAI Apps SDK metadata helpers
 *
 * These helpers generate the _meta fields required for ChatGPT Apps SDK integration.
 * Claude ignores these fields, so the same tools work with both platforms.
 */

// Bump the version when the widget HTML changes; ChatGPT caches templates by URI.
export const WIDGET_URI = "ui://widget/sirv-studio-v3.html";

/**
 * OAuth 2.0 security schemes for tools that require authentication
 * Used by both Claude and ChatGPT to trigger OAuth flow
 */
const AUTH_SECURITY_SCHEMES = [
  { type: "oauth2", scopes: ["sirv-ai:read", "sirv-ai:write"] },
];

/**
 * Generate OpenAI-specific _meta fields for a tool
 * Includes securitySchemes for OAuth authentication.
 * Only tools that return an image link the widget; the rest answer in text.
 */
export function openaiToolMeta(
  invokingText: string,
  invokedText: string,
  { widget = false }: { widget?: boolean } = {},
) {
  return {
    ...(widget && {
      ui: { resourceUri: WIDGET_URI },
      // Legacy ChatGPT alias for ui.resourceUri
      "openai/outputTemplate": WIDGET_URI,
    }),
    "openai/toolInvocation/invoking": invokingText,
    "openai/toolInvocation/invoked": invokedText,
    // MCP 2025-06-18 spec - securitySchemes for OAuth
    securitySchemes: AUTH_SECURITY_SCHEMES,
  };
}

const widget = { widget: true };

/**
 * Tool-specific metadata presets for consistent UX
 */
export const toolMeta = {
  // AI image processing
  removeBackground: openaiToolMeta("Removing background...", "Background removed", widget),
  upscale: openaiToolMeta("Upscaling image...", "Image upscaled", widget),
  backgroundReplace: openaiToolMeta("Replacing background...", "Background replaced", widget),
  objectRemoval: openaiToolMeta("Removing objects...", "Objects removed", widget),
  generate: openaiToolMeta("Generating image...", "Image generated", widget),
  imageToImage: openaiToolMeta("Transforming image...", "Image transformed", widget),
  imageTranslation: openaiToolMeta("Translating image text...", "Image text translated", widget),
  altText: openaiToolMeta("Generating description...", "Description generated"),
  depthMap: openaiToolMeta("Generating depth map...", "Depth map generated", widget),
  productLifestyle: openaiToolMeta("Creating lifestyle shot...", "Lifestyle shot created", widget),
  virtualTryOn: openaiToolMeta("Processing try-on...", "Try-on complete", widget),
  imageTo3d: openaiToolMeta("Generating 3D model...", "3D model generated"),
  optimizeGlb: openaiToolMeta("Optimizing GLB...", "GLB optimized"),
  videoGeneration: openaiToolMeta("Generating video...", "Video generated"),
  videoUpscale: openaiToolMeta("Upscaling video...", "Video upscaled"),
  batchRemoveBackground: openaiToolMeta("Processing batch...", "Batch complete"),
  batchUpscale: openaiToolMeta("Upscaling batch...", "Batch upscaled"),
  getUsage: openaiToolMeta("Checking usage...", "Usage retrieved"),
  listOrganizations: openaiToolMeta("Loading organizations...", "Organizations loaded"),
  listWorkflows: openaiToolMeta("Loading workflows...", "Workflows loaded"),
  getWorkflow: openaiToolMeta("Loading workflow...", "Workflow loaded"),

  // Asset management (DAM)
  listAssets: openaiToolMeta("Loading assets...", "Assets loaded"),
  getAsset: openaiToolMeta("Loading asset...", "Asset loaded"),
  searchAssets: openaiToolMeta("Searching assets...", "Search complete"),
  findSimilarAssets: openaiToolMeta("Finding similar assets...", "Similar assets found"),
  updateAsset: openaiToolMeta("Updating asset...", "Asset updated"),
  deleteAsset: openaiToolMeta("Deleting asset...", "Asset deleted"),
  getAssetMetadata: openaiToolMeta("Loading metadata...", "Metadata loaded"),
  updateAssetMetadata: openaiToolMeta("Updating metadata...", "Metadata updated"),
  generateAssetAltText: openaiToolMeta("Generating alt text...", "Alt text generated"),
  bulkAssetOperation: openaiToolMeta("Processing bulk operation...", "Bulk operation complete"),
  importAssetUrl: openaiToolMeta("Importing asset...", "Asset imported"),

  // Product management (PIM)
  listProducts: openaiToolMeta("Loading products...", "Products loaded"),
  getProduct: openaiToolMeta("Loading product...", "Product loaded"),
  createProduct: openaiToolMeta("Creating product...", "Product created"),
  updateProduct: openaiToolMeta("Updating product...", "Product updated"),
  deleteProduct: openaiToolMeta("Deleting product...", "Product deleted"),
  searchProducts: openaiToolMeta("Searching products...", "Search complete"),
  listProductsWithAssets: openaiToolMeta("Loading products...", "Products loaded"),
  linkAssetsToProduct: openaiToolMeta("Linking assets...", "Assets linked"),
  bulkProductAction: openaiToolMeta("Processing bulk action...", "Bulk action complete"),

  // Shopify integration
  shopifyStatus: openaiToolMeta("Checking Shopify...", "Shopify status retrieved"),
  pushImageToShopify: openaiToolMeta("Pushing to Shopify...", "Image pushed to Shopify"),
  syncShopifyProducts: openaiToolMeta("Syncing Shopify...", "Shopify sync complete"),
  supplierAutofix: openaiToolMeta("Running supplier autofix...", "Supplier autofix complete"),
  supplierReviewAssistRequirements: openaiToolMeta(
    "Loading supplier requirements...",
    "Supplier requirements loaded",
  ),
  supplierSftpStatus: openaiToolMeta("Checking supplier SFTP...", "Supplier SFTP status retrieved"),
};
