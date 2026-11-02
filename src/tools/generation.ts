import { z } from "zod";
import type { ToolRegistrar } from "./types.js";
import { formatError } from "./types.js";
import { PUBLIC_OPENAPI_TOOL_METADATA } from "../generated/public-openapi-tool-metadata.js";
import { toolMeta } from "../openai/meta.js";

const GenerateSchema = z.object({
  prompt: z
    .string()
    .min(1)
    .max(2000)
    .describe("Text description of the image to generate"),
  model: z
    .enum(["nano-banana-2-lite", "nano-banana-2", "flux3", "zimage", "gemini", "seedream", "gpt-image-2"])
    .default("nano-banana-2-lite")
    .describe("Generation model. Nano Banana 2 Lite is the default"),
  aspect_ratio: z
    .enum(["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"])
    .default("1:1")
    .describe("Output aspect ratio"),
  num_images: z
    .number()
    .int()
    .min(1)
    .max(4)
    .default(1)
    .describe("Number of images to generate (1-4)"),
}).strict();

const ImageToImageSchema = z.object({
  image_url: z.string().url().describe("URL of the source image to transform"),
  prompt: z
    .string()
    .min(1)
    .max(2000)
    .describe("Description of the desired transformation"),
  strength: z
    .number()
    .min(0)
    .max(1)
    .default(0.75)
    .describe("Transformation strength 0-1 (higher = more change from original)"),
  model: z
    .enum(["nano-banana-lite-edit", "nano-banana-2-edit", "flux3-edit", "qwen-integrate-product", "seedream-edit", "gpt-image-2-edit", "zimage-i2i"])
    .default("nano-banana-lite-edit")
    .describe("Transformation model. Nano Banana 2 Lite is the default"),
}).strict();

const ImageTranslationSchema = z.object({
  image_url: z.string().url().describe("URL of the source image whose visible text should be translated"),
  target_language: z
    .string()
    .min(1)
    .describe("Target language code or name for the translated image text"),
  source_language: z
    .string()
    .min(1)
    .optional()
    .describe("Optional source language code or name"),
  model: z
    .enum(["nano-banana-lite-edit", "gemini", "gpt-image-2-edit", "seedream-edit"])
    .default("nano-banana-lite-edit")
    .describe("Image translation model. Nano Banana 2 Lite is the default"),
}).strict();

const VideoGenerationSchema = z.object({
  prompt: z.string().min(1).max(2000).describe("Description of the video to generate"),
  image_url: z
    .string()
    .url()
    .optional()
    .describe("Starting image. Required for veo31, ltx and kling. Optional for h3-max. Not used by veo31ref"),
  image_urls: z
    .array(z.string().url())
    .min(1)
    .max(5)
    .optional()
    .describe("Reference images (1-5) that keep the subject the same. Required for veo31ref, not used by other models"),
  model: z
    .enum(["veo31", "veo31ref", "ltx", "kling", "h3-max"])
    .default("veo31")
    .describe("Video generation model"),
  duration: z
    .string()
    .optional()
    .describe("Video duration in seconds (e.g., '4', '6', '8')"),
  resolution: z
    .enum(["480P", "768P", "720p", "1080p", "1440p", "2160p"])
    .optional()
    .describe("Video resolution"),
  aspect_ratio: z
    .enum(["auto", "16:9", "9:16", "1:1"])
    .optional()
    .describe("Video aspect ratio"),
  generate_audio: z
    .boolean()
    .default(false)
    .describe("Whether to generate audio for the video"),
}).strict();

const VideoUpscaleSchema = z.object({
  video_url: z.string().url().describe("URL of the source video to upscale"),
  model: z
    .enum(["seedvr-video", "topaz-video"])
    .default("seedvr-video")
    .describe("Video upscale model"),
  scale: z
    .union([z.literal(2), z.literal(4)])
    .default(2)
    .describe("Upscale factor"),
  target_resolution: z
    .enum(["auto", "720p", "1080p", "1440p", "2160p"])
    .default("auto")
    .describe("Target output resolution"),
  source_width: z
    .number()
    .int()
    .positive()
    .describe("Source video width in pixels"),
  source_height: z
    .number()
    .int()
    .positive()
    .describe("Source video height in pixels"),
  source_duration_seconds: z
    .number()
    .positive()
    .describe("Source video duration in seconds"),
  source_frame_rate: z
    .number()
    .positive()
    .optional()
    .describe("Source video frame rate"),
}).strict();

export const registerGenerationTools: ToolRegistrar = (server, context) => {
  server.registerTool(
    "sirv_generate",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_generate.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_generate.description,
      inputSchema: GenerateSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      _meta: toolMeta.generate,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const results = await client.generate(params.prompt, {
          model: params.model,
          aspectRatio: params.aspect_ratio,
          numImages: params.num_images,
        });

        const output = {
          success: true,
          result_urls: results,
          count: results.length,
          model: params.model,
          aspect_ratio: params.aspect_ratio,
        };

        const urlList = results.map((url, i) => `${i + 1}. ${url}`).join("\n");

        return {
          content: [
            {
              type: "text",
              text: `Generated ${results.length} image(s) successfully.\n\n${urlList}`,
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
    "sirv_image_to_image",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_image_to_image.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_image_to_image.description,
      inputSchema: ImageToImageSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta.imageToImage,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        // Report the strength that was sent; 0 is a valid strength.
        const strength = params.strength ?? 0.75;
        const result = await client.imageToImage(params.image_url, params.prompt, {
          strength,
          model: params.model,
        });

        const output = {
          success: true,
          result_url: result,
          model: params.model,
          strength,
        };

        return {
          content: [
            {
              type: "text",
              text: `Image transformed successfully.\n\nResult: ${result}`,
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
    "sirv_image_translation",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_image_translation.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_image_translation.description,
      inputSchema: ImageTranslationSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta.imageTranslation,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const result = await client.imageTranslation(params.image_url, params.target_language, {
          sourceLanguage: params.source_language,
          model: params.model,
        });

        const output = {
          success: true,
          result_url: result,
          model: params.model,
          target_language: params.target_language,
          source_language: params.source_language,
        };

        return {
          content: [
            {
              type: "text",
              text: `Image text translated successfully.\n\nResult: ${result}`,
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
    "sirv_video_generation",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_video_generation.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_video_generation.description,
      inputSchema: VideoGenerationSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta.videoGeneration,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const result = await client.videoGeneration(params.prompt, {
          imageUrl: params.image_url,
          imageUrls: params.image_urls,
          model: params.model,
          duration: params.duration,
          resolution: params.resolution,
          aspectRatio: params.aspect_ratio,
          generateAudio: params.generate_audio,
        });

        const output = {
          success: true,
          video_url: result,
          model: params.model,
          duration: params.duration,
        };

        return {
          content: [
            {
              type: "text",
              text: `Video generated successfully.\n\nResult: ${result}`,
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
    "sirv_video_upscale",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_video_upscale.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_video_upscale.description,
      inputSchema: VideoUpscaleSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta.videoUpscale,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const result = await client.videoUpscale(params.video_url, {
          model: params.model,
          scale: params.scale,
          targetResolution: params.target_resolution,
          sourceWidth: params.source_width,
          sourceHeight: params.source_height,
          sourceDurationSeconds: params.source_duration_seconds,
          sourceFrameRate: params.source_frame_rate,
        });

        const output = {
          success: true,
          video_url: result,
          model: params.model,
          scale: params.scale,
          target_resolution: params.target_resolution,
        };

        return {
          content: [
            {
              type: "text",
              text: `Video upscaled successfully.\n\nResult: ${result}`,
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
