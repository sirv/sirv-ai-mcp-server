import { z } from "zod";
import type { ToolRegistrar } from "./types.js";
import { formatError, truncateIfNeeded } from "./types.js";
import { toolMeta } from "../openai/meta.js";

const ListWorkflowsSchema = z.object({}).strict();

const GetWorkflowSchema = z
  .object({
    workflow_id: z.string().uuid().describe("ID of the workflow to retrieve"),
  })
  .strict();

export const registerWorkflowTools: ToolRegistrar = (server, context) => {
  server.registerTool(
    "sirv_list_workflows",
    {
      title: "List Workflows",
      description: `List all saved workflows for the current user.

Returns a list of workflow summaries including:
- id: Unique workflow identifier
- name: Workflow name
- description: Optional description
- stepCount: Number of steps in the workflow
- stepTypes: Array of step type names (e.g., ["removeBackground", "upscale"])

Workflows run in Sirv AI Studio. Each workflow step type also has its own tool.`,
      inputSchema: ListWorkflowsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta.listWorkflows,
    },
    async () => {
      try {
        const client = context.getApiClient();
        const workflows = await client.listWorkflows();

        if (workflows.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No workflows found. Create workflows in the Sirv AI Studio web app.",
              },
            ],
            structuredContent: { workflows: [] },
          };
        }

        let text = `Found ${workflows.length} workflow(s):\n\n`;
        for (const w of workflows) {
          text += `**${w.name}** (${w.id})\n`;
          if (w.description) text += `  ${w.description}\n`;
          text += `  Steps: ${w.stepTypes.join(" -> ")}\n\n`;
        }

        return {
          content: [{ type: "text", text: truncateIfNeeded(text) }],
          structuredContent: { workflows },
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
    "sirv_get_workflow",
    {
      title: "Get Workflow Details",
      description: `Get detailed information about a specific workflow.

Args:
  - workflow_id (string, required): UUID of the workflow

Returns detailed workflow information including:
- Full step configurations
- Each step's type and parameters
- Workflow metadata

Use this to see what a workflow does. Workflows run in Sirv AI Studio; to run one step
through MCP, call the tool for that step type.`,
      inputSchema: GetWorkflowSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta.getWorkflow,
    },
    async (params) => {
      try {
        const client = context.getApiClient();
        const workflow = await client.getWorkflow(params.workflow_id);

        let text = `**${workflow.name}**\n`;
        if (workflow.description) text += `${workflow.description}\n`;
        text += `\nSteps (${workflow.stepCount}):\n`;

        for (let i = 0; i < workflow.steps.length; i++) {
          const step = workflow.steps[i];
          text += `${i + 1}. ${step.type}`;
          if (step.variations && step.variations > 1) {
            text += ` (${step.variations} variations)`;
          }
          text += `\n`;
        }

        return {
          content: [{ type: "text", text: truncateIfNeeded(text) }],
          structuredContent: { workflow },
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
