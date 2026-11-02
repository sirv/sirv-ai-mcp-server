import type { z } from "zod";
import type { SirvApiClient } from "../api-client.js";
import { CHARACTER_LIMIT } from "../constants.js";

export interface ToolContext {
  getApiClient: () => SirvApiClient;
}

export interface ToolServer {
  registerTool<Schema extends z.ZodObject<z.ZodRawShape>>(
    name: string,
    config: Record<string, unknown> & { inputSchema: Schema },
    handler: (params: z.output<Schema>) => Promise<unknown> | unknown,
  ): unknown;
}

export type ToolRegistrar = (server: ToolServer, context: ToolContext) => void;

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function truncateIfNeeded(text: string): string {
  if (text.length > CHARACTER_LIMIT) {
    return text.slice(0, CHARACTER_LIMIT) + "\n\n[Output truncated due to length]";
  }
  return text;
}
