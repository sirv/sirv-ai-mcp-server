import { z } from "zod";
import type { ToolRegistrar } from "./types.js";
import { formatError } from "./types.js";
import { PUBLIC_OPENAPI_TOOL_METADATA } from "../generated/public-openapi-tool-metadata.js";
import { toolMeta } from "../openai/meta.js";

const AltTextSchema = z.object({
  image_url: z.string().url().describe("URL of the image to describe"),
  detail_level: z
    .enum(["caption", "detailed-caption", "more-detailed-caption"])
    .default("detailed-caption")
    .describe("Level of detail: 'caption' (brief), 'detailed-caption' (standard), 'more-detailed-caption' (comprehensive)"),
}).strict();

const DepthMapSchema = z.object({
  image_url: z.string().url().describe("URL of the image to analyze"),
}).strict();

export const registerAnalysisTools: ToolRegistrar = (server, context) => {
  server.registerTool(
    "sirv_alt_text",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_alt_text.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_alt_text.description,
      inputSchema: AltTextSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta.altText,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const result = await client.altText(params.image_url, {
          detailLevel: params.detail_level,
        });

        const output = {
          success: true,
          alt_text: result,
          detail_level: params.detail_level,
        };

        return {
          content: [
            {
              type: "text",
              text: `Alt text generated:\n\n"${result}"`,
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
    "sirv_depth_map",
    {
      title: PUBLIC_OPENAPI_TOOL_METADATA.sirv_depth_map.title,
      description: PUBLIC_OPENAPI_TOOL_METADATA.sirv_depth_map.description,
      inputSchema: DepthMapSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta.depthMap,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const result = await client.depthMap(params.image_url);

        const output = {
          success: true,
          result_url: result,
        };

        return {
          content: [
            {
              type: "text",
              text: `Depth map generated successfully.\n\nResult: ${result}`,
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
