import { z } from "zod";
import type { ToolRegistrar } from "./types.js";
import { formatError, truncateIfNeeded } from "./types.js";
import { toolMeta } from "../openai/meta.js";

const BatchRemoveBackgroundSchema = z.object({
  images: z
    .array(
      z.object({
        id: z.string().describe("Unique identifier for this image"),
        image_url: z.string().url().describe("URL of the image"),
      })
    )
    .min(1)
    .max(100)
    .describe("Array of images to process"),
  model: z
    .string()
    .default("General Use (Heavy)")
    .describe("Model to use for all images"),
}).strict();

const BatchUpscaleSchema = z.object({
  images: z
    .array(
      z.object({
        id: z.string().describe("Unique identifier for this image"),
        image_url: z.string().url().describe("URL of the image"),
      })
    )
    .min(1)
    .max(100)
    .describe("Array of images to upscale"),
  scale: z
    .number()
    .int()
    .min(2)
    .max(4)
    .default(2)
    .describe("Upscale factor for all images"),
  model: z
    .enum(["esrgan", "clarity", "topaz"])
    .default("esrgan")
    .describe("Upscaler model"),
}).strict();

export const registerBatchTools: ToolRegistrar = (server, context) => {
  server.registerTool(
    "sirv_batch_remove_background",
    {
      title: "Batch Remove Background",
      description: `Remove backgrounds from multiple images in a batch operation.

Processes multiple images at once for efficiency. Returns results for each image including success/failure status.

Args:
  - images (array, required): Array of {id, image_url} objects
  - model (string): Model to use for all images (default: 'General Use (Heavy)')

Returns:
  Array of results with:
  - id: Original image ID
  - status: 'success' or 'error'
  - url: Result URL (if successful)
  - error: Error message (if failed)

Cost: 1-2 credits per image`,
      inputSchema: BatchRemoveBackgroundSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta.batchRemoveBackground,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const results = await client.batchRemoveBackground(params.images, params.model);

        const successCount = results.filter((r) => r.status === "success").length;
        const errorCount = results.filter((r) => r.status === "error").length;

        const output = {
          success: true,
          results,
          summary: {
            total: results.length,
            succeeded: successCount,
            failed: errorCount,
          },
        };

        let text = `Batch background removal completed.\n\nSummary: ${successCount} succeeded, ${errorCount} failed\n\nResults:`;
        for (const result of results) {
          if (result.status === "success") {
            text += `\n- ${result.id}: ${result.url}`;
          } else {
            text += `\n- ${result.id}: ERROR - ${result.error}`;
          }
        }

        return {
          content: [{ type: "text", text: truncateIfNeeded(text) }],
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
    "sirv_batch_upscale",
    {
      title: "Batch Upscale Images",
      description: `Upscale multiple images in a batch operation.

Processes multiple images at once for efficiency. Returns results for each image.

Args:
  - images (array, required): Array of {id, image_url} objects
  - scale (number): Upscale factor 2-4x (default: 2)
  - model (string): Upscaler model (default: 'esrgan')

Returns:
  Array of results with status and URLs

Cost: 2-3 credits per image`,
      inputSchema: BatchUpscaleSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta.batchUpscale,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const results = await client.batchUpscale(params.images, {
          scale: params.scale,
          model: params.model,
        });

        const successCount = results.filter((r) => r.status === "success").length;
        const errorCount = results.filter((r) => r.status === "error").length;

        const output = {
          success: true,
          results,
          summary: {
            total: results.length,
            succeeded: successCount,
            failed: errorCount,
          },
        };

        let text = `Batch upscaling completed.\n\nSummary: ${successCount} succeeded, ${errorCount} failed\n\nResults:`;
        for (const result of results) {
          if (result.status === "success") {
            text += `\n- ${result.id}: ${result.url}`;
          } else {
            text += `\n- ${result.id}: ERROR - ${result.error}`;
          }
        }

        return {
          content: [{ type: "text", text: truncateIfNeeded(text) }],
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
