import { createRequire } from "node:module";

export const CHARACTER_LIMIT = 25000;

// Resolves to mcp-server/package.json from both src/ and dist/.
const pkg = createRequire(import.meta.url)("../package.json") as { version: string; mcpName: string };
export const SERVER_VERSION = pkg.version;
/** The MCP Registry name, also used as the Server Card name. */
export const REGISTRY_NAME = pkg.mcpName;

export function getStudioBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.SIRV_AI_BASE_URL || "https://www.sirv.studio";
}
