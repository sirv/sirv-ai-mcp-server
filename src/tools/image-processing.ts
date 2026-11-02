import { z } from "zod";
import type { ToolRegistrar } from "./types.js";
import { formatError } from "./types.js";
import { PUBLIC_OPENAPI_TOOL_METADATA } from "../generated/public-openapi-tool-metadata.js";
import { toolMeta } from "../openai/meta.js";

const RemoveBackgroundSchema = z.object({
  image_url: z.string().url().describe("URL of the image to process"),
  provider: z
    .enum(["birefnet", "bria", "pixelcut"])
    .default("birefnet")
    .describe(
      "Background removal provider: 'birefnet' (default, best quality), 'bria' (faster) or 'pixelcut' (cleanest product cut-outs)",
    ),
  model: z
    .enum([
      "General Use (Light)",
      "General Use (Light 2K)",
      "General Use (Heavy)",
      "Matting",
      "Portrait",
      "General Use (Dynamic)",
    ])
    .default("General Use (Heavy)")
    .describe("Model to use for background removal. 'General Use (Heavy)' is recommended for best quality"),
  operating_resolution: z
    .enum(["1024x1024", "2048x2048", "2304x2304"])
    .default("1024x1024")
    .describe("Processing resolution. Higher = better quality but slower"),
}).strict();

const UpscaleSchema = z.object({
  image_url: z.string().url().describe("URL of the image to upscale"),
  scale: z
    .number()
    .int()
    .min(2)
    .max(4)
    .default(2)
    .describe("Upscale factor: 2x, 3x, or 4x"),
  model: z
    .enum(["esrgan", "clarity", "topaz"])
    .default("esrgan")
    .describe("Upscaler model: 'esrgan' (fast, general), 'clarity' (AI-enhanced), 'topaz' (premium quality)"),
  prompt: z
    .string()
    .optional()
    .describe("Optional prompt to guide the upscaling (only for clarity model)"),
  creativity: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Creativity level 0-1 for clarity model (higher = more creative enhancement)"),
}).strict();

export const BackgroundReplaceSchema = z.object({
  image_url: z.string().url().describe("URL of the image with subject to keep"),
  prompt: z
    .string()
    .optional()
    .describe("Text description of the new background"),
  ref_image_url: z
    .string()
    .url()
    .optional()
    .describe("URL of a reference image for the new background style"),
  model: z.preprocess(
    (value) => value === "nano-banana" ? "nano-banana-lite" : value,
    z.enum(["nano-banana-lite", "bria", "flux3-edit"])
      .default("nano-banana-lite"),
  )
    .describe("Background replacement model. Nano Banana 2 Lite is the default"),
}).strict();

const ObjectRemovalSchema = z.object({
  image_url: z.string().url().describe("URL of the image to edit"),
  mask_url: z
    .string()
    .url()
    .describe("URL of a mask image where white areas indicate objects to remove"),
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .optional()
    .describe("Optional description of what fills the masked area. Without it, the masked objects are removed."),
}).strict();

export const registerImageProcessingTools: ToolRegistrar = (server, context) => {
  server.registerTool(
    "sirv_remove_background",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_remove_background.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_remove_background.description,
      inputSchema: RemoveBackgroundSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta.removeBackground,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const result = await client.removeBackground(params.image_url, {
          provider: params.provider,
          v2Model: params.model,
          operatingResolution: params.operating_resolution,
          version: "v2",
        });

        return {
          content: [
            {
              type: "text",
              text: `Background removed successfully.\n\nResult: ${result}`,
            },
          ],
          structuredContent: {
            tool: "sirv_remove_background",
            success: true,
            input_url: params.image_url,
            result_url: result,
            settings: {
              provider: params.provider,
              model: params.model,
              operating_resolution: params.operating_resolution,
            },
          },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${formatError(error)}` }],
          isError: true,
          structuredContent: {
            tool: "sirv_remove_background",
            success: false,
            error: formatError(error),
          },
        };
      }
    }
  );

  server.registerTool(
    "sirv_upscale",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_upscale.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_upscale.description,
      inputSchema: UpscaleSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta.upscale,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const result = await client.upscale(params.image_url, {
          scale: params.scale,
          model: params.model,
          prompt: params.prompt,
          creativity: params.creativity,
        });

        return {
          content: [
            {
              type: "text",
              text: `Image upscaled ${params.scale}x successfully.\n\nResult: ${result}`,
            },
          ],
          structuredContent: {
            tool: "sirv_upscale",
            success: true,
            input_url: params.image_url,
            result_url: result,
            settings: {
              scale: params.scale,
              model: params.model,
              prompt: params.prompt,
              creativity: params.creativity,
            },
          },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${formatError(error)}` }],
          isError: true,
          structuredContent: {
            tool: "sirv_upscale",
            success: false,
            error: formatError(error),
          },
        };
      }
    }
  );

  server.registerTool(
    "sirv_background_replace",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_background_replace.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_background_replace.description,
      inputSchema: BackgroundReplaceSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta.backgroundReplace,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const result = await client.backgroundReplace(params.image_url, {
          prompt: params.prompt,
          refImageUrl: params.ref_image_url,
          model: params.model,
        });

        return {
          content: [
            {
              type: "text",
              text: `Background replaced successfully.\n\nResult: ${result}`,
            },
          ],
          structuredContent: {
            tool: "sirv_background_replace",
            success: true,
            input_url: params.image_url,
            result_url: result,
            settings: {
              prompt: params.prompt,
              ref_image_url: params.ref_image_url,
              model: params.model,
            },
          },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${formatError(error)}` }],
          isError: true,
          structuredContent: {
            tool: "sirv_background_replace",
            success: false,
            error: formatError(error),
          },
        };
      }
    }
  );

  server.registerTool(
    "sirv_object_removal",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_object_removal.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_object_removal.description,
      inputSchema: ObjectRemovalSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta.objectRemoval,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const result = await client.objectRemoval(params.image_url, params.mask_url, params.prompt);

        return {
          content: [
            {
              type: "text",
              text: `Masked area edited successfully.\n\nResult: ${result}`,
            },
          ],
          structuredContent: {
            tool: "sirv_object_removal",
            success: true,
            input_url: params.image_url,
            mask_url: params.mask_url,
            result_url: result,
          },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${formatError(error)}` }],
          isError: true,
          structuredContent: {
            tool: "sirv_object_removal",
            success: false,
            error: formatError(error),
          },
        };
      }
    }
  );
};
