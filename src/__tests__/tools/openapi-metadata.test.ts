import { describe, expect, it } from "vitest";
import { registerAnalysisTools } from "../../tools/analysis.js";
import { registerAssetTools } from "../../tools/assets.js";
import { registerGenerationTools } from "../../tools/generation.js";
import { registerImageProcessingTools } from "../../tools/image-processing.js";
import { registerProductTools } from "../../tools/product.js";
import { registerProductManagementTools } from "../../tools/product-management.js";
import { registerSirvCdnTools } from "../../tools/sirv-cdn.js";
import {
  PUBLIC_OPENAPI_TOOL_METADATA,
  type PublicOpenApiToolName,
} from "../../generated/public-openapi-tool-metadata.js";

type RegisteredTool = {
  description?: string;
  title?: string;
};

const publicOpenApiToolNames = Object.keys(
  PUBLIC_OPENAPI_TOOL_METADATA,
) as PublicOpenApiToolName[];

function collectRegisteredTools() {
  const tools = new Map<string, RegisteredTool>();
  const server = {
    registerTool: (name: string, definition: RegisteredTool) => {
      tools.set(name, definition);
    },
  };
  const context = {
    getApiClient: () => {
      throw new Error("api client should not be requested while registering tools");
    },
  };

  registerImageProcessingTools(server as never, context as never);
  registerGenerationTools(server as never, context as never);
  registerAnalysisTools(server as never, context as never);
  registerProductTools(server as never, context as never);
  registerProductManagementTools(server as never, context as never);
  registerAssetTools(server as never, context as never);
  registerSirvCdnTools(server as never, context as never);

  return tools;
}

describe("public OpenAPI MCP tool metadata", () => {
  it("keeps overlapping MCP tool titles and descriptions generated from the public OpenAPI registry", () => {
    const registeredTools = collectRegisteredTools();

    for (const toolName of publicOpenApiToolNames) {
      const generatedMetadata = PUBLIC_OPENAPI_TOOL_METADATA[toolName];
      const registeredTool = registeredTools.get(toolName);

      expect(registeredTool, `${toolName} should be registered`).toBeDefined();
      expect(registeredTool?.title).toBe(generatedMetadata.title);
      expect(registeredTool?.description).toBe(generatedMetadata.description);
    }
  });
});
