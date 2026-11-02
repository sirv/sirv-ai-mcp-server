import { z } from "zod";
import type { ToolRegistrar } from "./types.js";
import { formatError } from "./types.js";
import { toolMeta } from "../openai/meta.js";

const GetUsageStatsSchema = z.object({}).strict();
const ListOrganizationsSchema = z.object({}).strict();

export const registerAccountTools: ToolRegistrar = (server, context) => {
  server.registerTool(
    "sirv_get_usage",
    {
      title: "Get Usage Statistics",
      description: `Get account credit balance and usage statistics.

Returns credit balance, tier, and breakdown of operations performed.
The balance is the one AI actions charge, and reading it needs permission to
view credits. When it cannot be read, the tool returns an error, never a
balance of zero. The tier is left out when this sign-in cannot read the plan.

Args: None

Returns:
  Object with:
  - credits: Current credit balance
  - tier: Account tier, left out when this sign-in cannot read it
  - creditsUsed: Total credits consumed by operations
  - totalOperations: Total number of operations performed
  - topOperations: Top operations by credit usage
  - topUpUrl: Studio page where the workspace buys more credits`,
      inputSchema: GetUsageStatsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta.getUsage,
    },
    async () => {
      try {
        const client = context.getApiClient();
        const stats = await client.getUsageStats();

        const output = {
          success: true,
          stats,
        };

        const topOps = stats.topOperations
          .map(([name, { count, credits }]) => `  - ${name}: ${count} ops, ${credits} credits`)
          .join("\n");

        const text = `Account & Usage Statistics:
- Credit Balance: ${stats.credits.toLocaleString()}
- Tier: ${stats.tier ?? "not available to this sign-in"}
- Credits Used: ${stats.creditsUsed.toLocaleString()}
- Total Operations: ${stats.totalOperations.toLocaleString()}
- Top Operations:\n${topOps}
- Top up credits: ${stats.topUpUrl}`;

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
    "sirv_list_organizations",
    {
      title: "List Organizations",
      description: `List all organizations the current user belongs to.

Returns the organization ID, name, slug, role, and whether it's a personal workspace.
Use the organization ID as the orgId parameter in other tools to scope requests to that organization.

Args: None

Returns:
  Array of organizations with:
  - id: Organization UUID (use as orgId in other tools)
  - name: Organization display name
  - slug: URL-friendly identifier
  - role: User's role in the organization
  - isPersonal: Whether this is the user's personal workspace
  - isOwner: Whether the user owns this organization`,
      inputSchema: ListOrganizationsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta.listOrganizations,
    },
    async () => {
      try {
        const client = context.getApiClient();
        const organizations = await client.listOrganizations();

        const output = {
          success: true,
          organizations,
          count: organizations.length,
        };

        const lines = organizations.map((org) => {
          const flags = [
            org.role,
            org.isPersonal && "personal",
            org.isOwner && "owner",
          ].filter(Boolean).join(", ");
          return `- ${org.name} (${org.id}) [${flags}]`;
        });

        const text = organizations.length > 0
          ? `Organizations (${organizations.length}):\n${lines.join("\n")}`
          : "No organizations found.";

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
};
