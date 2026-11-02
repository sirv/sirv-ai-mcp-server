// AUTO-GENERATED - DO NOT EDIT
// Generated from src/lib/api/public-openapi-spec.ts
// Run 'npm run api:openapi' to regenerate.

export type PublicOpenApiToolName = "sirv_cdn_search_files" | "sirv_cdn_get_file_metadata" | "sirv_cdn_manage_file" | "sirv_cdn_manage_folder" | "sirv_cdn_upload_from_url" | "sirv_cdn_update_file_metadata" | "sirv_cdn_update_file_tags" | "sirv_list_assets" | "sirv_search_assets" | "sirv_get_asset" | "sirv_update_asset" | "sirv_delete_asset" | "sirv_get_asset_metadata" | "sirv_update_asset_metadata" | "sirv_generate_asset_alt_text" | "sirv_bulk_asset_operation" | "sirv_import_asset_url" | "sirv_list_products" | "sirv_create_product" | "sirv_get_product" | "sirv_update_product" | "sirv_delete_product" | "sirv_search_products" | "sirv_list_products_with_assets" | "sirv_link_assets_to_product" | "sirv_bulk_product_action" | "sirv_remove_background" | "sirv_upscale" | "sirv_generate" | "sirv_image_to_image" | "sirv_image_translation" | "sirv_background_replace" | "sirv_object_removal" | "sirv_alt_text" | "sirv_depth_map" | "sirv_product_lifestyle" | "sirv_virtual_try_on" | "sirv_image_to_3d" | "sirv_optimize_glb" | "sirv_video_generation" | "sirv_video_upscale";

export type PublicOpenApiToolMetadata = {
  readonly description: string;
  readonly method: string;
  readonly operationId: string;
  readonly path: string;
  readonly title: string;
};

export const PUBLIC_OPENAPI_TOOL_METADATA = {
  "sirv_cdn_search_files": {
    "title": "Search Sirv Files",
    "description": "Search files in the connected Sirv account using Sirv search syntax for Zapier and automation workflows.\n\nPublic API: POST /api/zapier/sirv/search\n\nReturns:\n  Successfully searched Sirv files\n\nCredits: This endpoint does not consume credits.",
    "method": "POST",
    "operationId": "zapierSirvSearch",
    "path": "/api/zapier/sirv/search"
  },
  "sirv_cdn_get_file_metadata": {
    "title": "Get Sirv File Metadata",
    "description": "Fetch reviewed metadata fields and file information for one file in the connected Sirv account.\n\nPublic API: POST /api/zapier/sirv/get-metadata\n\nReturns:\n  Successfully fetched Sirv file metadata\n\nCredits: This endpoint does not consume credits.",
    "method": "POST",
    "operationId": "zapierSirvGetMetadata",
    "path": "/api/zapier/sirv/get-metadata"
  },
  "sirv_cdn_manage_file": {
    "title": "Rename, Copy, or Delete a Sirv File",
    "description": "Queue a Sirv file rename, copy, or delete operation for the connected workspace account.\n\nPublic API: POST /api/zapier/sirv/file\n\nReturns:\n  Successfully queued Sirv file operation\n\nCredits: This endpoint does not consume credits.",
    "method": "POST",
    "operationId": "zapierSirvFile",
    "path": "/api/zapier/sirv/file"
  },
  "sirv_cdn_manage_folder": {
    "title": "Create or List a Sirv Folder",
    "description": "Create a Sirv folder or list folder contents in the connected workspace account.\n\nPublic API: POST /api/zapier/sirv/folder\n\nReturns:\n  Successfully performed Sirv folder operation\n\nCredits: This endpoint does not consume credits.",
    "method": "POST",
    "operationId": "zapierSirvFolder",
    "path": "/api/zapier/sirv/folder"
  },
  "sirv_cdn_upload_from_url": {
    "title": "Upload to Sirv from URL",
    "description": "Fetch a remote file URL into the connected Sirv account for Zapier and automation workflows.\n\nPublic API: POST /api/zapier/sirv/upload\n\nReturns:\n  Successfully uploaded remote file to Sirv\n\nCredits: This endpoint does not consume credits.",
    "method": "POST",
    "operationId": "zapierSirvUpload",
    "path": "/api/zapier/sirv/upload"
  },
  "sirv_cdn_update_file_metadata": {
    "title": "Update Sirv File Metadata",
    "description": "Queue a Sirv file metadata update for the connected workspace account.\n\nPublic API: POST /api/zapier/sirv/metadata\n\nReturns:\n  Successfully queued Sirv metadata update\n\nCredits: This endpoint does not consume credits.",
    "method": "POST",
    "operationId": "zapierSirvMetadata",
    "path": "/api/zapier/sirv/metadata"
  },
  "sirv_cdn_update_file_tags": {
    "title": "Add or Remove Sirv File Tags",
    "description": "Queue a Sirv file tag add or remove operation for the connected workspace account.\n\nPublic API: POST /api/zapier/sirv/tags\n\nReturns:\n  Successfully queued Sirv tag update\n\nCredits: This endpoint does not consume credits.",
    "method": "POST",
    "operationId": "zapierSirvTags",
    "path": "/api/zapier/sirv/tags"
  },
  "sirv_list_assets": {
    "title": "List Assets",
    "description": "List assets in the DAM library with filtering, sorting, and pagination.\n\nPublic API: GET /api/assets\n\nReturns:\n  Successfully listed assets\n\nCredits: This endpoint does not consume credits.",
    "method": "GET",
    "operationId": "listAssets",
    "path": "/api/assets"
  },
  "sirv_search_assets": {
    "title": "Search Assets",
    "description": "Full-text search across assets using ranked matching.\n\nPublic API: GET /api/assets/search\n\nReturns:\n  Successfully searched assets\n\nCredits: This endpoint does not consume credits.",
    "method": "GET",
    "operationId": "searchAssets",
    "path": "/api/assets/search"
  },
  "sirv_get_asset": {
    "title": "Get Asset",
    "description": "Get a single asset by ID with its stored asset details.\n\nPublic API: GET /api/assets/{id}\n\nReturns:\n  Successfully retrieved asset\n\nCredits: This endpoint does not consume credits.",
    "method": "GET",
    "operationId": "getAsset",
    "path": "/api/assets/{id}"
  },
  "sirv_update_asset": {
    "title": "Update Asset",
    "description": "Update editable asset fields such as filename, alt text, and favorite state.\n\nPublic API: PATCH /api/assets/{id}\n\nReturns:\n  Successfully updated asset\n\nCredits: This endpoint does not consume credits.",
    "method": "PATCH",
    "operationId": "updateAsset",
    "path": "/api/assets/{id}"
  },
  "sirv_delete_asset": {
    "title": "Delete Asset",
    "description": "Soft-delete an asset so it can be restored later.\n\nPublic API: DELETE /api/assets/{id}\n\nReturns:\n  Successfully deleted asset\n\nCredits: This endpoint does not consume credits.",
    "method": "DELETE",
    "operationId": "deleteAsset",
    "path": "/api/assets/{id}"
  },
  "sirv_get_asset_metadata": {
    "title": "Get Asset Metadata",
    "description": "Get custom metadata for an asset, including template context when applied.\n\nPublic API: GET /api/assets/{id}/metadata\n\nReturns:\n  Successfully retrieved asset metadata\n\nCredits: This endpoint does not consume credits.",
    "method": "GET",
    "operationId": "getAssetMetadata",
    "path": "/api/assets/{id}/metadata"
  },
  "sirv_update_asset_metadata": {
    "title": "Update Asset Metadata",
    "description": "Update custom metadata fields on an asset.\n\nPublic API: PATCH /api/assets/{id}/metadata\n\nReturns:\n  Successfully updated asset metadata\n\nCredits: This endpoint does not consume credits.",
    "method": "PATCH",
    "operationId": "updateAssetMetadata",
    "path": "/api/assets/{id}/metadata"
  },
  "sirv_generate_asset_alt_text": {
    "title": "Generate Asset Alt Text",
    "description": "AI-generate alt text for an asset and save it.\n\nPublic API: POST /api/assets/{id}/alt-text\n\nReturns:\n  Successfully generated asset alt text",
    "method": "POST",
    "operationId": "generateAssetAltText",
    "path": "/api/assets/{id}/alt-text"
  },
  "sirv_bulk_asset_operation": {
    "title": "Bulk Asset Operation",
    "description": "Perform a bulk operation on multiple assets.\n\nPublic API: POST /api/assets/bulk\n\nReturns:\n  Successfully applied bulk asset operation\n\nCredits: This endpoint does not consume credits.",
    "method": "POST",
    "operationId": "bulkAssetOperation",
    "path": "/api/assets/bulk"
  },
  "sirv_import_asset_url": {
    "title": "Import Asset from URL",
    "description": "Import an asset from an external URL into the DAM library.\n\nPublic API: POST /api/assets/import-url\n\nReturns:\n  Successfully imported asset\n\nCredits: This endpoint does not consume credits.",
    "method": "POST",
    "operationId": "importAssetUrl",
    "path": "/api/assets/import-url"
  },
  "sirv_list_products": {
    "title": "List Products",
    "description": "List products in the PIM with filtering, sorting, readiness, and pagination.\n\nPublic API: GET /api/products\n\nReturns:\n  Successfully listed products\n\nCredits: This endpoint does not consume credits.",
    "method": "GET",
    "operationId": "listProducts",
    "path": "/api/products"
  },
  "sirv_create_product": {
    "title": "Create Product",
    "description": "Create a product in the PIM catalog.\n\nPublic API: POST /api/products\n\nReturns:\n  Successfully created product\n\nCredits: This endpoint does not consume credits.",
    "method": "POST",
    "operationId": "createProduct",
    "path": "/api/products"
  },
  "sirv_get_product": {
    "title": "Get Product",
    "description": "Get a single product by ID, including readiness context when requested.\n\nPublic API: GET /api/products/{id}\n\nReturns:\n  Successfully retrieved product\n\nCredits: This endpoint does not consume credits.",
    "method": "GET",
    "operationId": "getProduct",
    "path": "/api/products/{id}"
  },
  "sirv_update_product": {
    "title": "Update Product",
    "description": "Update editable product fields in the PIM catalog.\n\nPublic API: PATCH /api/products/{id}\n\nReturns:\n  Successfully updated product\n\nCredits: This endpoint does not consume credits.",
    "method": "PATCH",
    "operationId": "updateProduct",
    "path": "/api/products/{id}"
  },
  "sirv_delete_product": {
    "title": "Delete Product",
    "description": "Delete a product from the PIM catalog.\n\nPublic API: DELETE /api/products/{id}\n\nReturns:\n  Successfully deleted product\n\nCredits: This endpoint does not consume credits.",
    "method": "DELETE",
    "operationId": "deleteProduct",
    "path": "/api/products/{id}"
  },
  "sirv_search_products": {
    "title": "Search Products",
    "description": "Search products by name or SKU with optional fuzzy matching.\n\nPublic API: GET /api/products/search\n\nReturns:\n  Successfully searched products\n\nCredits: This endpoint does not consume credits.",
    "method": "GET",
    "operationId": "searchProducts",
    "path": "/api/products/search"
  },
  "sirv_list_products_with_assets": {
    "title": "List Products with Assets",
    "description": "List products with their linked asset details and asset counts.\n\nPublic API: GET /api/products/with-assets\n\nReturns:\n  Successfully listed products with assets\n\nCredits: This endpoint does not consume credits.",
    "method": "GET",
    "operationId": "listProductsWithAssets",
    "path": "/api/products/with-assets"
  },
  "sirv_link_assets_to_product": {
    "title": "Link Assets to Product",
    "description": "Link one or more assets to a product with optional merchandising role metadata.\n\nPublic API: POST /api/products/{id}/assets\n\nReturns:\n  Successfully linked assets to product\n\nCredits: This endpoint does not consume credits.",
    "method": "POST",
    "operationId": "linkAssetsToProduct",
    "path": "/api/products/{id}/assets"
  },
  "sirv_bulk_product_action": {
    "title": "Bulk Product Action",
    "description": "Perform a bulk action such as delete, status update, field update, or asset linking.\n\nPublic API: POST /api/products/bulk\n\nReturns:\n  Successfully applied bulk product action\n\nCredits: This endpoint does not consume credits.",
    "method": "POST",
    "operationId": "bulkProductAction",
    "path": "/api/products/bulk"
  },
  "sirv_remove_background": {
    "title": "Remove Background",
    "description": "Remove the background from an image, leaving only the foreground subject with transparency. Ideal for product photos and portraits.\n\nPublic API: POST /api/tools/remove-background\n\nReturns:\n  Successfully removed background",
    "method": "POST",
    "operationId": "removeBackground",
    "path": "/api/tools/remove-background"
  },
  "sirv_upscale": {
    "title": "Upscale Image",
    "description": "Upscale an image to a higher resolution using AI-powered super-resolution.\n\nPublic API: POST /api/tools/upscale\n\nReturns:\n  Successfully upscaled image",
    "method": "POST",
    "operationId": "upscaleImage",
    "path": "/api/tools/upscale"
  },
  "sirv_generate": {
    "title": "Generate Image",
    "description": "Generate images from a text description using Sirv AI Studio image models.\n\nPublic API: POST /api/tools/generate\n\nReturns:\n  Successfully generated images",
    "method": "POST",
    "operationId": "generateImage",
    "path": "/api/tools/generate"
  },
  "sirv_image_to_image": {
    "title": "Image to Image Transform",
    "description": "Transform an existing image based on a text prompt while preserving useful source-image context.\n\nPublic API: POST /api/tools/image-to-image\n\nReturns:\n  Successfully transformed image",
    "method": "POST",
    "operationId": "imageToImage",
    "path": "/api/tools/image-to-image"
  },
  "sirv_image_translation": {
    "title": "Translate Image Text",
    "description": "Translate visible text in an image while preserving the original layout, typography, and image style.\n\nPublic API: POST /api/tools/image-translation\n\nReturns:\n  Successfully translated image text",
    "method": "POST",
    "operationId": "translateImageText",
    "path": "/api/tools/image-translation"
  },
  "sirv_background_replace": {
    "title": "Replace Background",
    "description": "Replace the background of an image while keeping the foreground subject intact.\n\nPublic API: POST /api/tools/background-replace\n\nReturns:\n  Successfully replaced background",
    "method": "POST",
    "operationId": "replaceBackground",
    "path": "/api/tools/background-replace"
  },
  "sirv_object_removal": {
    "title": "Remove or Fill Masked Area",
    "description": "Remove unwanted objects or fill a masked area with a prompt using AI inpainting.\n\nPublic API: POST /api/tools/object-removal\n\nReturns:\n  Successfully edited masked area",
    "method": "POST",
    "operationId": "removeObjects",
    "path": "/api/tools/object-removal"
  },
  "sirv_alt_text": {
    "title": "Generate Alt Text",
    "description": "Generate descriptive alt text for an image using AI vision models.\n\nPublic API: POST /api/tools/alt-text\n\nReturns:\n  Successfully generated alt text",
    "method": "POST",
    "operationId": "generateAltText",
    "path": "/api/tools/alt-text"
  },
  "sirv_depth_map": {
    "title": "Generate Depth Map",
    "description": "Generate a depth map from an image showing relative distances. Lighter areas are closer; darker areas are farther.\n\nPublic API: POST /api/tools/depth-map\n\nReturns:\n  Successfully generated depth map\n\nCredits: This endpoint does not consume credits.",
    "method": "POST",
    "operationId": "generateDepthMap",
    "path": "/api/tools/depth-map"
  },
  "sirv_product_lifestyle": {
    "title": "Create Product Lifestyle Shot",
    "description": "Place a product in a realistic lifestyle scene for marketing and commerce content.\n\nPublic API: POST /api/tools/product-lifestyle\n\nReturns:\n  Successfully created lifestyle shots",
    "method": "POST",
    "operationId": "createProductLifestyle",
    "path": "/api/tools/product-lifestyle"
  },
  "sirv_virtual_try_on": {
    "title": "Virtual Try-On",
    "description": "Virtually try clothing on a person using AI.\n\nPublic API: POST /api/tools/virtual-try-on\n\nReturns:\n  Successfully generated try-on image",
    "method": "POST",
    "operationId": "virtualTryOn",
    "path": "/api/tools/virtual-try-on"
  },
  "sirv_image_to_3d": {
    "title": "Convert Image to 3D Model",
    "description": "Convert a 2D image into a 3D model and return the generated model assets.\n\nPublic API: POST /api/tools/image-to-3d\n\nReturns:\n  Successfully generated 3D model",
    "method": "POST",
    "operationId": "imageTo3d",
    "path": "/api/tools/image-to-3d"
  },
  "sirv_optimize_glb": {
    "title": "Optimize GLB Model",
    "description": "Optimize a binary .glb model up to 100 MB with mesh cleanup, Draco compression, optional simplification, and optional texture compression.\n\nPublic API: POST /api/tools/glb-optimize\n\nReturns:\n  Successfully optimized GLB model",
    "method": "POST",
    "operationId": "optimizeGlb",
    "path": "/api/tools/glb-optimize"
  },
  "sirv_video_generation": {
    "title": "Generate Video",
    "description": "Generate a video from a prompt and a starting image (`image_url`). The `veo31ref` model takes reference images in `image_urls` instead. The `h3-max` model also accepts a prompt with no image.\n\nPublic API: POST /api/tools/video-generation\n\nReturns:\n  Successfully generated video",
    "method": "POST",
    "operationId": "generateVideo",
    "path": "/api/tools/video-generation"
  },
  "sirv_video_upscale": {
    "title": "Upscale Video",
    "description": "Upscale a video to a higher resolution.\n\nPublic API: POST /api/tools/video-upscale\n\nReturns:\n  Successfully upscaled video",
    "method": "POST",
    "operationId": "upscaleVideo",
    "path": "/api/tools/video-upscale"
  }
} as const satisfies Record<PublicOpenApiToolName, PublicOpenApiToolMetadata>;
