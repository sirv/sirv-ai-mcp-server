import { z } from "zod";
import type { ToolRegistrar } from "./types.js";
import { formatError, truncateIfNeeded } from "./types.js";
import { PUBLIC_OPENAPI_TOOL_METADATA } from "../generated/public-openapi-tool-metadata.js";
import { openaiToolMeta } from "../openai/meta.js";

// Tools for the workspace's connected Sirv account. Studio validates every
// field again; these schemas only guide the model.
const orgId = z.string().uuid().optional().describe("Organization ID (uses default org if omitted)");
const filePath = z.string().min(1).describe("Full Sirv file path, such as /products/hero.jpg");
const tags = z.array(z.string().min(1).max(32)).min(1).max(50);

const SIRV_CDN_TOOLS = [
  {
    name: "sirv_cdn_search_files",
    action: "search",
    readOnly: true,
    destructive: false,
    schema: z.object({
      query: z.string().min(1).describe("Sirv search query, such as a filename, folder, tag, or extension query"),
      from: z.number().int().min(0).max(1000).optional().describe("Pagination offset"),
      size: z.number().int().min(1).max(100).optional().describe("Number of results (default 100)"),
      sort_field: z
        .enum(["filename.raw", "basename.raw", "dirname.raw", "contentType.raw", "mtime", "ctime", "size"])
        .optional()
        .describe("Field to sort by; needs sort_order"),
      sort_order: z.enum(["asc", "desc"]).optional().describe("Sort direction; needs sort_field"),
      orgId,
    }).strict(),
  },
  {
    name: "sirv_cdn_get_file_metadata",
    action: "get-metadata",
    readOnly: true,
    destructive: false,
    schema: z.object({ file_path: filePath, orgId }).strict(),
  },
  {
    name: "sirv_cdn_manage_folder",
    action: "folder",
    readOnly: false,
    destructive: false,
    schema: z.object({
      action: z.enum(["create", "list"]).describe("Create the folder or list its contents"),
      folder_path: z.string().min(1).describe("Full Sirv folder path, such as /products"),
      continuation: z.string().min(1).optional().describe("Cursor from a previous list call"),
      orgId,
    }).strict(),
  },
  {
    name: "sirv_cdn_upload_from_url",
    action: "upload",
    readOnly: false,
    destructive: true,
    schema: z.object({
      image_url: z.string().url().describe("Public URL of the file to upload"),
      filename: z.string().min(1).optional().describe("Filename in Sirv"),
      folder: z.string().min(1).optional().describe("Destination folder (default /ai-tools)"),
      target_path: z.string().min(1).optional().describe("Full destination path; replaces folder and filename"),
      orgId,
    }).strict(),
  },
  {
    name: "sirv_cdn_update_file_metadata",
    action: "metadata",
    readOnly: false,
    destructive: true,
    schema: z.object({
      file_path: filePath,
      title: z.string().max(256).optional(),
      description: z.string().max(1024).optional(),
      tags: tags.optional().describe("Replaces the file's tags"),
      product: z.object({
        id: z.string().max(256).optional(),
        name: z.string().max(256).optional(),
        brand: z.string().max(256).optional(),
        category1: z.string().max(256).optional(),
        category2: z.string().max(256).optional(),
      }).strict().optional(),
      orgId,
    }).strict(),
  },
  {
    name: "sirv_cdn_update_file_tags",
    action: "tags",
    readOnly: false,
    destructive: true, // action "remove" deletes tags from live files
    schema: z.object({
      file_path: filePath,
      action: z.enum(["add", "remove"]).default("add"),
      tags,
      orgId,
    }).strict(),
  },
  {
    name: "sirv_cdn_manage_file",
    action: "file",
    readOnly: false,
    destructive: true,
    schema: z.object({
      action: z.enum(["rename", "copy", "delete"]),
      file_path: filePath,
      target_path: z.string().min(1).optional().describe("Destination path for rename and copy"),
      orgId,
    }).strict(),
  },
] as const;

export const registerSirvCdnTools: ToolRegistrar = (server, context) => {
  for (const tool of SIRV_CDN_TOOLS) {
    const metadata = PUBLIC_OPENAPI_TOOL_METADATA[tool.name];
    server.registerTool(
      tool.name,
      {
        title: metadata.title,
        description: metadata.description,
        inputSchema: tool.schema as z.ZodObject<z.ZodRawShape>,
        annotations: {
          readOnlyHint: tool.readOnly,
          destructiveHint: tool.destructive,
          idempotentHint: tool.readOnly,
          // Only the URL upload reaches outside the user's own Sirv account.
          openWorldHint: tool.name === "sirv_cdn_upload_from_url",
        },
        _meta: openaiToolMeta(`${metadata.title}...`, "Done"),
      },
      async (params) => {
        try {
          const { orgId: org, ...data } = params as Record<string, unknown> & { orgId?: string };
          const result = await context.getApiClient().callSirvCdn(tool.action, data, org);
          return {
            content: [{ type: "text", text: truncateIfNeeded(JSON.stringify(result, null, 2)) }],
            structuredContent: result,
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: `Error: ${formatError(error)}` }],
            isError: true,
          };
        }
      },
    );
  }
};
