import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { WIDGET_URI } from "./meta.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load widget HTML at module load time
let widgetHtml: string;
try {
  const widgetPath = path.join(__dirname, "../../public/widgets/sirv-studio.html");
  widgetHtml = fs.readFileSync(widgetPath, "utf-8");
} catch {
  // Fallback for development or when file doesn't exist
  widgetHtml = `<!DOCTYPE html>
<html><head><title>Sirv AI Studio</title></head>
<body><p>Widget not found. Please ensure sirv-studio.html exists in public/widgets/</p></body>
</html>`;
  console.error("Warning: Could not load sirv-studio.html widget");
}

const MIME_TYPE = "text/html;profile=mcp-app";

// The widget calls tools through the host, so it needs no fetch access.
// Images come from Studio storage, Sirv, fal.ai, and ChatGPT file uploads.
const CSP = {
  connectDomains: [] as string[],
  resourceDomains: [
    "https://assets.sirv.studio",
    "https://*.sirv.com",
    "https://fal.media",
    "https://*.fal.media",
    "https://*.oaiusercontent.com",
  ],
};

/**
 * Register the Sirv AI Studio widget as an MCP Apps resource.
 *
 * ChatGPT renders it for image-result tools. `domain` is the public origin of
 * this server; the directory requires one for apps with UI.
 */
export function registerWidgetResource(server: McpServer, domain?: string): void {
  const meta = {
    ui: { prefersBorder: true, csp: CSP, ...(domain && { domain }) },
    // Legacy ChatGPT aliases of the ui.* fields
    "openai/widgetPrefersBorder": true,
    "openai/widgetCSP": {
      connect_domains: CSP.connectDomains,
      resource_domains: CSP.resourceDomains,
    },
    ...(domain && { "openai/widgetDomain": domain }),
  };

  server.registerResource(
    "sirv-studio-widget",
    WIDGET_URI,
    {
      description: "Sirv AI Studio interactive widget for image processing",
      mimeType: MIME_TYPE,
    },
    async () => ({
      contents: [{ uri: WIDGET_URI, mimeType: MIME_TYPE, text: widgetHtml, _meta: meta }],
    })
  );
}
