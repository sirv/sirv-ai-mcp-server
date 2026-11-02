import { z } from "zod";
import type {
  SupplierAutofixResponse,
  SupplierReviewAssistRequirement,
  SupplierReviewAssistRequirementsResponse,
  SupplierSftpStatusResponse,
} from "../types.js";
import { toolMeta } from "../openai/meta.js";
import type { ToolRegistrar } from "./types.js";
import { formatError } from "./types.js";

const orgId = z.string().uuid().optional().describe("Organization ID (uses default org if omitted)");

const SupplierSftpStatusSchema = z.object({
  orgId,
}).strict();

const SupplierReviewAssistRequirementsSchema = z.object({
  orgId,
}).strict();

const SupplierAutofixFailedRuleSchema = z.object({
  ruleId: z.string(),
  ruleType: z.string(),
  passed: z.boolean(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
}).strict();

const SupplierAutofixSchema = z.object({
  orgId,
  image_url: z.string().url().describe("URL of the supplier image to autofix"),
  mode: z.enum(["auto", "prompt"]).default("auto").describe("Autofix mode"),
  failed_rules: z.array(SupplierAutofixFailedRuleSchema).optional().describe(
    "Failed review rules to guide auto-mode repairs",
  ),
  prompt: z.string().optional().describe("Prompt to guide prompt-mode repairs"),
  max_iterations: z.number().int().min(1).max(5).default(3).describe(
    "Maximum autofix iterations",
  ),
  ai_model: z.enum(["gemini-2-flash", "gemini-3-flash"]).default("gemini-2-flash"),
  enabled_fixes: z.object({
    upscale: z.boolean().default(true),
    remove_background: z.boolean().default(true),
    smart_crop: z.boolean().default(true),
    image_to_image: z.boolean().default(true),
  }).optional(),
  upscale_model: z.enum(["esrgan", "clarity", "topaz"]).default("esrgan"),
}).strict();

function renderSupplierSftpStatus(result: SupplierSftpStatusResponse): string {
  if (!result.configured) {
    return "Supplier SFTP is not configured for this workspace.";
  }

  return [
    "Supplier SFTP is configured.",
    `Host: ${result.host}`,
    `Port: ${result.sftpPort}`,
    `Username: ${result.username}`,
    `Root path: ${result.rootPath}`,
  ].join("\n");
}

function renderAutofixState(requirement: SupplierReviewAssistRequirement): string {
  if (requirement.autofixEnabled === true) {
    return "enabled";
  }

  if (requirement.autofixEnabled === false) {
    return "disabled";
  }

  return "not specified";
}

function renderSupplierReviewAssistRequirements(
  result: SupplierReviewAssistRequirementsResponse,
): string {
  if (!result.hasRequirements || !result.requirement) {
    return "No Supplier review-assist requirements are configured for this workspace.";
  }

  const { requirement } = result;
  const lines = [
    `Supplier review-assist requirements: ${requirement.specName}`,
    `Scope: ${requirement.scope}`,
    `Autofix: ${renderAutofixState(requirement)}`,
    `Pass threshold: ${requirement.passThreshold}`,
  ];

  if (requirement.rules.length > 0) {
    lines.push("Rules:");
    for (const rule of requirement.rules) {
      lines.push(`- ${rule.label}: ${rule.description}`);
    }
  }

  return lines.join("\n");
}

function renderSupplierAutofix(result: SupplierAutofixResponse): string {
  const lines = [
    "Supplier autofix completed.",
    `Fixed: ${result.fixed ? "yes" : "no"}`,
    `Result: ${result.image.url}`,
  ];

  if (result.appliedFixes && result.appliedFixes.length > 0) {
    lines.push(`Applied fixes: ${result.appliedFixes.join(", ")}`);
  }

  if (result.error) {
    lines.push(`Error: ${result.error}`);
  }

  return lines.join("\n");
}

export const registerSupplierPortalTools: ToolRegistrar = (server, context) => {
  server.registerTool(
    "sirv_get_supplier_sftp_status",
    {
      title: "Get Supplier SFTP Status",
      description: `Get Supplier Portal SFTP connection status for the current workspace.

This returns whether supplier SFTP is configured and, when configured, the
host, port, username, and root path a supplier should use. It does not reset
passwords or mutate SFTP configuration.

Requires Supplier Portal Pro SFTP access for the workspace.`,
      inputSchema: SupplierSftpStatusSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta.supplierSftpStatus,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const result = await client.getSupplierSftpStatus(params.orgId);

        return {
          content: [{ type: "text", text: renderSupplierSftpStatus(result) }],
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

  server.registerTool(
    "sirv_get_supplier_review_assist_requirements",
    {
      title: "Get Supplier Review-Assist Requirements",
      description: `Get Supplier Portal review-assist requirements for the current workspace.

This returns the active Supplier Portal submission requirement summary,
including rule labels, pass threshold, and whether review autofix is enabled.
It does not generate candidates or mutate submitted assets.

Requires Supplier Portal access for the workspace.`,
      inputSchema: SupplierReviewAssistRequirementsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta.supplierReviewAssistRequirements,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const result = await client.getSupplierReviewAssistRequirements(params.orgId);

        return {
          content: [{
            type: "text",
            text: renderSupplierReviewAssistRequirements(result),
          }],
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

  server.registerTool(
    "sirv_run_supplier_autofix",
    {
      title: "Run Supplier Autofix",
      description: `Run autofix on a supplier image.

This calls the Studio autofix API for the selected workspace and can invoke
paid AI image processing. Use auto mode with failed review rules or prompt mode
with an explicit repair prompt.

Charges workspace credits. Requires full API/MCP access.`,
      inputSchema: SupplierAutofixSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta.supplierAutofix,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const result = await client.runSupplierAutofix({
          aiModel: params.ai_model,
          enabledFixes: params.enabled_fixes
            ? {
                imageToImage: params.enabled_fixes.image_to_image,
                removeBackground: params.enabled_fixes.remove_background,
                smartCrop: params.enabled_fixes.smart_crop,
                upscale: params.enabled_fixes.upscale,
              }
            : undefined,
          failedRules: params.failed_rules,
          imageUrl: params.image_url,
          maxIterations: params.max_iterations,
          mode: params.mode,
          prompt: params.prompt,
          upscaleModel: params.upscale_model,
        }, params.orgId);

        return {
          content: [{ type: "text", text: renderSupplierAutofix(result) }],
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
};
