import { z } from "zod";
import type { ToolRegistrar } from "./types.js";
import { formatError } from "./types.js";
import { PUBLIC_OPENAPI_TOOL_METADATA } from "../generated/public-openapi-tool-metadata.js";
import { toolMeta } from "../openai/meta.js";

const ProductLifestyleSchema = z.object({
  image_url: z.string().url().describe("URL of the product image (ideally with transparent background)"),
  scene_description: z
    .string()
    .optional()
    .describe("Description of the lifestyle scene to place the product in"),
  ref_image_url: z
    .string()
    .url()
    .optional()
    .describe("URL of a reference image for the scene style"),
  model: z
    .enum(["ideogram-keep", "nano-banana-lite", "bria", "gemini", "gpt-image-2", "seedream", "flux3"])
    .default("ideogram-keep")
    .describe("Lifestyle image model. The default, ideogram-keep, keeps the product's own pixels; the others can redraw the product"),
  placement_type: z
    .enum(["original", "automatic", "manual_placement", "manual_padding"])
    .default("automatic")
    .describe("How to place the product in the scene"),
  position: z
    .enum([
      "bottom_center",
      "bottom_left",
      "bottom_right",
      "upper_center",
      "upper_left",
      "upper_right",
      "center_vertical",
      "center_horizontal",
      "left_center",
      "right_center",
    ])
    .optional()
    .describe("Position of the product in the scene (for manual_placement)"),
  num_results: z
    .number()
    .int()
    .min(1)
    .max(4)
    .default(1)
    .describe("Number of variations to generate"),
}).strict();

const VirtualTryOnSchema = z.object({
  person_image_url: z.string().url().describe("URL of the person/model image"),
  garment_image_url: z.string().url().describe("URL of the clothing item image"),
}).strict();

const ImageTo3DSchema = z.object({
  image_url: z.string().url().describe("URL of the image to convert to 3D"),
  model: z
    .enum(["meshy", "meshy-multi", "seed3d", "trellis", "trellis2", "hunyuan3d"])
    .default("meshy")
    .describe("3D generation model"),
  topology: z
    .enum(["triangle", "quad"])
    .default("triangle")
    .describe("Mesh topology type"),
  target_polycount: z
    .number()
    .int()
    .min(1000)
    .max(200000)
    .optional()
    .describe("Target polygon count for the mesh"),
  enable_pbr: z
    .boolean()
    .default(true)
    .describe("Enable PBR (physically-based rendering) textures"),
}).strict();

const OptimizeGlbSchema = z.object({
  glb_url: z.string().url().describe("HTTPS URL of a binary .glb file up to 100 MB"),
  simplify_ratio: z
    .number()
    .min(0)
    .max(1)
    .default(1)
    .describe("Target mesh simplification ratio; 1 keeps full geometry"),
  simplify_error: z
    .number()
    .min(0)
    .max(1)
    .default(0.001)
    .describe("Maximum simplification error tolerance"),
  dedup: z.boolean().default(true).describe("Remove duplicate vertices, meshes, textures, and materials"),
  prune: z.boolean().default(true).describe("Remove unused data from the model"),
  draco: z.boolean().default(true).describe("Apply Draco mesh compression"),
  instance: z.boolean().default(true).describe("Instance repeated meshes"),
  flatten: z.boolean().default(true).describe("Flatten the scene hierarchy"),
  join: z.boolean().default(true).describe("Join separate meshes where possible"),
  weld: z.boolean().default(true).describe("Weld nearby duplicate vertices"),
  quantize: z.boolean().default(true).describe("Quantize vertex attributes before compression"),
  texture_format: z
    .enum(["jpeg", "png", "webp", "avif"])
    .nullable()
    .default(null)
    .describe("Optional texture output format"),
  texture_size: z
    .union([
      z.literal(256),
      z.literal(512),
      z.literal(1024),
      z.literal(2048),
      z.literal(4096),
      z.null(),
    ])
    .default(null)
    .describe("Optional maximum texture dimension"),
}).strict();

export const registerProductTools: ToolRegistrar = (server, context) => {
  server.registerTool(
    "sirv_product_lifestyle",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_product_lifestyle.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_product_lifestyle.description,
      inputSchema: ProductLifestyleSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta.productLifestyle,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const results = await client.productLifestyle(params.image_url, {
          model: params.model,
          sceneDescription: params.scene_description,
          refImageUrl: params.ref_image_url,
          placementType: params.placement_type,
          position: params.position,
          numResults: params.num_results,
        });

        const output = {
          success: true,
          result_urls: results,
          count: results.length,
        };

        const urlList = results.map((url, i) => `${i + 1}. ${url}`).join("\n");

        return {
          content: [
            {
              type: "text",
              text: `Generated ${results.length} lifestyle shot(s) successfully.\n\n${urlList}`,
            },
          ],
          structuredContent: output,
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
    "sirv_virtual_try_on",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_virtual_try_on.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_virtual_try_on.description,
      inputSchema: VirtualTryOnSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta.virtualTryOn,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const result = await client.virtualTryOn(
          params.person_image_url,
          params.garment_image_url
        );

        const output = {
          success: true,
          result_url: result,
        };

        return {
          content: [
            {
              type: "text",
              text: `Virtual try-on completed successfully.\n\nResult: ${result}`,
            },
          ],
          structuredContent: output,
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
    "sirv_image_to_3d",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_image_to_3d.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_image_to_3d.description,
      inputSchema: ImageTo3DSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta.imageTo3d,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const result = await client.imageTo3d(params.image_url, {
          model: params.model,
          topology: params.topology,
          targetPolycount: params.target_polycount,
          enablePbr: params.enable_pbr,
        });

        const output = {
          success: true,
          model_url: result.modelUrl,
          formats: result.formats,
          thumbnail: result.thumbnail,
        };

        let text = `3D model generated successfully.\n\nPrimary Model: ${result.modelUrl}`;
        if (result.formats && Object.keys(result.formats).length > 1) {
          text += "\n\nAvailable formats:";
          for (const [format, url] of Object.entries(result.formats)) {
            text += `\n- ${format.toUpperCase()}: ${url}`;
          }
        }
        if (result.thumbnail) {
          text += `\n\nThumbnail: ${result.thumbnail}`;
        }

        return {
          content: [{ type: "text", text }],
          structuredContent: output,
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
    "sirv_optimize_glb",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_optimize_glb.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_optimize_glb.description,
      inputSchema: OptimizeGlbSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta.optimizeGlb,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const result = await client.optimizeGlb(params.glb_url, {
          simplifyRatio: params.simplify_ratio,
          simplifyError: params.simplify_error,
          dedup: params.dedup,
          prune: params.prune,
          draco: params.draco,
          instance: params.instance,
          flatten: params.flatten,
          join: params.join,
          weld: params.weld,
          quantize: params.quantize,
          textureFormat: params.texture_format,
          textureSize: params.texture_size,
        });

        const output = {
          success: true,
          optimized_url: result.optimizedUrl,
          original_size: result.originalSize,
          optimized_size: result.optimizedSize,
          reduction_percent: result.reductionPercent,
          vertex_count: result.vertexCount,
          triangle_count: result.triangleCount,
        };

        return {
          content: [
            {
              type: "text",
              text:
                `GLB optimized successfully.\n\nOptimized model: ${result.optimizedUrl}`
                + `\nOriginal size: ${result.originalSize} bytes`
                + `\nOptimized size: ${result.optimizedSize} bytes`
                + `\nReduction: ${result.reductionPercent}%`,
            },
          ],
          structuredContent: output,
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
