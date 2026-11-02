import { describe, it, expect } from "vitest";
import { openaiToolMeta, toolMeta, WIDGET_URI } from "../../openai/meta.js";

describe("openaiToolMeta", () => {
  it("generates status text without a UI template by default", () => {
    const meta = openaiToolMeta("Processing...", "Done");

    expect(meta).toHaveProperty("openai/toolInvocation/invoking", "Processing...");
    expect(meta).toHaveProperty("openai/toolInvocation/invoked", "Done");
    expect(meta).toHaveProperty("securitySchemes");
    expect(meta).not.toHaveProperty("ui");
    expect(meta).not.toHaveProperty("openai/outputTemplate");
  });

  it("links the widget through the MCP Apps key and the ChatGPT alias", () => {
    const meta = openaiToolMeta("Processing...", "Done", { widget: true });

    expect(meta).toHaveProperty("ui", { resourceUri: WIDGET_URI });
    expect(meta).toHaveProperty("openai/outputTemplate", WIDGET_URI);
  });

  it("includes OAuth security schemes", () => {
    const meta = openaiToolMeta("Test", "Test");

    expect(meta.securitySchemes).toBeInstanceOf(Array);
    expect(meta.securitySchemes).toHaveLength(1);
    expect(meta.securitySchemes[0]).toEqual({
      type: "oauth2",
      scopes: ["sirv-ai:read", "sirv-ai:write"],
    });
  });
});

describe("toolMeta presets", () => {
  const toolMetaKeys = [
    "removeBackground",
    "upscale",
    "backgroundReplace",
    "objectRemoval",
    "generate",
    "imageToImage",
    "imageTranslation",
    "altText",
    "depthMap",
    "productLifestyle",
    "virtualTryOn",
    "imageTo3d",
    "videoGeneration",
    "batchRemoveBackground",
    "batchUpscale",
    "getUsage",
    "listWorkflows",
    "getWorkflow",
    "listAssets",
    "getAsset",
    "searchAssets",
    "findSimilarAssets",
    "updateAsset",
    "deleteAsset",
    "getAssetMetadata",
    "updateAssetMetadata",
    "generateAssetAltText",
    "bulkAssetOperation",
    "importAssetUrl",
    "listProducts",
    "getProduct",
    "createProduct",
    "updateProduct",
    "deleteProduct",
    "searchProducts",
    "listProductsWithAssets",
    "linkAssetsToProduct",
    "bulkProductAction",
    "shopifyStatus",
    "pushImageToShopify",
    "syncShopifyProducts",
  ] as const;

  it.each(toolMetaKeys)("toolMeta.%s has correct structure", (key) => {
    const meta = toolMeta[key];

    expect(meta).toHaveProperty("openai/toolInvocation/invoking");
    expect(meta).toHaveProperty("openai/toolInvocation/invoked");
    expect(meta).toHaveProperty("securitySchemes");
  });

  const imageResultKeys = [
    "removeBackground",
    "upscale",
    "backgroundReplace",
    "objectRemoval",
    "generate",
    "imageToImage",
    "imageTranslation",
    "depthMap",
    "productLifestyle",
    "virtualTryOn",
  ] as const;

  it.each(imageResultKeys)("toolMeta.%s opens the image widget", (key) => {
    expect(toolMeta[key]).toHaveProperty("ui.resourceUri", WIDGET_URI);
  });

  it.each(
    toolMetaKeys.filter((key) => !(imageResultKeys as readonly string[]).includes(key)),
  )("toolMeta.%s has no image widget", (key) => {
    expect(toolMeta[key]).not.toHaveProperty("ui");
    expect(toolMeta[key]).not.toHaveProperty("openai/outputTemplate");
  });

  it("removeBackground has appropriate loading text", () => {
    expect(toolMeta.removeBackground["openai/toolInvocation/invoking"]).toBe(
      "Removing background..."
    );
    expect(toolMeta.removeBackground["openai/toolInvocation/invoked"]).toBe(
      "Background removed"
    );
  });

  it("upscale has appropriate loading text", () => {
    expect(toolMeta.upscale["openai/toolInvocation/invoking"]).toBe(
      "Upscaling image..."
    );
    expect(toolMeta.upscale["openai/toolInvocation/invoked"]).toBe(
      "Image upscaled"
    );
  });

  it("generate has appropriate loading text", () => {
    expect(toolMeta.generate["openai/toolInvocation/invoking"]).toBe(
      "Generating image..."
    );
    expect(toolMeta.generate["openai/toolInvocation/invoked"]).toBe(
      "Image generated"
    );
  });

  it("videoGeneration has appropriate loading text", () => {
    expect(toolMeta.videoGeneration["openai/toolInvocation/invoking"]).toBe(
      "Generating video..."
    );
    expect(toolMeta.videoGeneration["openai/toolInvocation/invoked"]).toBe(
      "Video generated"
    );
  });
});
