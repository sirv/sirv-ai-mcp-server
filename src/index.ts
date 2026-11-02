#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SirvApiClient } from "./api-client.js";
import { createHttpServer } from "./http-server.js";
import { registerAllTools } from "./tools/index.js";

const TRANSPORT_MODE = process.env.MCP_TRANSPORT || "stdio";
const HTTP_PORT = parseInt(process.env.MCP_HTTP_PORT || "3001", 10);
const HTTP_HOST = process.env.MCP_HTTP_HOST || "0.0.0.0";
const ENABLE_IP_ALLOWLIST = process.env.MCP_ENABLE_IP_ALLOWLIST === "true";
const SSL_KEY_PATH = process.env.MCP_SSL_KEY_PATH;
const SSL_CERT_PATH = process.env.MCP_SSL_CERT_PATH;
const CORS_ORIGINS = process.env.MCP_CORS_ORIGINS?.split(",").map((s) => s.trim());
const ADDITIONAL_ALLOWED_IPS = process.env.MCP_ALLOWED_IPS?.split(",").map((s) => s.trim());

let cachedClient: SirvApiClient | null = null;

function getApiClient(requestToken?: string, metered?: boolean): SirvApiClient {
  const baseUrl = process.env.SIRV_AI_BASE_URL || "http://localhost:3000";
  const apiKey = process.env.SIRV_AI_API_KEY;

  // In HTTP mode with a request token, create a per-request client
  // to avoid race conditions with the shared cached client. The token is the
  // caller's credential, so this client must never fall back to the local
  // interactive OAuth flow.
  if (requestToken) {
    return new SirvApiClient(baseUrl, { kind: "requestToken", token: requestToken, metered });
  }

  // For stdio mode or requests without a token, use a cached client
  if (cachedClient) return cachedClient;
  cachedClient = new SirvApiClient(
    baseUrl,
    apiKey ? { apiKey, kind: "apiKey" } : { kind: "localOAuth" },
  );
  return cachedClient;
}

// Factory function to create a new MCP server instance with all tools registered
// Used for stateless HTTP mode where each request gets a fresh server
function createMcpServer(requestToken?: string, metered?: boolean): McpServer {
  const server = new McpServer(
    { name: "sirv-ai-mcp-server", version: "1.0.0" },
    // Well above a 500-asset bulk call; reject large records before schema validation.
    { maxToolInputElements: 10_000 },
  );
  registerAllTools(server, { getApiClient: () => getApiClient(requestToken, metered) });
  return server;
}

async function main() {
  const baseUrl = process.env.SIRV_AI_BASE_URL || "http://localhost:3000";
  const apiKey = process.env.SIRV_AI_API_KEY;

  console.error(
    `SIRV_AI_BASE_URL=${process.env.SIRV_AI_BASE_URL || "(not set, using default: http://localhost:3000)"}`,
  );
  console.error(`Backend URL: ${baseUrl}`);

  // If no API key, authenticate via OAuth before starting (only for stdio mode)
  if (!apiKey && TRANSPORT_MODE === "stdio") {
    console.error("No API key provided. Will use OAuth for authentication.");
    try {
      const client = getApiClient();
      await client.authenticate();
      console.error("Authentication successful.");
    } catch (error) {
      // Sanitize error message to avoid leaking sensitive info in logs
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      // Only log safe parts of the error (no stack traces, tokens, etc.)
      const safeMessage = errorMessage
        .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
        .replace(/token[=:]\s*\S+/gi, "token=[REDACTED]")
        .replace(/key[=:]\s*\S+/gi, "key=[REDACTED]");
      console.error("Authentication failed:", safeMessage);
      console.error("You can still use the server, but requests may fail until authenticated.");
    }
  }

  if (TRANSPORT_MODE === "http") {
    const mcpBaseUrl = process.env.MCP_BASE_URL || `http://localhost:${HTTP_PORT}`;

    // Pass factory function for stateless mode (fresh server per request)
    const httpServer = createHttpServer(createMcpServer, {
      port: HTTP_PORT,
      host: HTTP_HOST,
      baseUrl: mcpBaseUrl,
      corsOrigins: CORS_ORIGINS,
      sslKeyPath: SSL_KEY_PATH,
      sslCertPath: SSL_CERT_PATH,
      enableIpAllowlist: ENABLE_IP_ALLOWLIST,
      allowedIps: ADDITIONAL_ALLOWED_IPS,
    });

    httpServer.start();
    console.error(`Sirv AI MCP Server running via HTTP on port ${HTTP_PORT}`);
    console.error(`Transport mode: ${TRANSPORT_MODE} (stateless)`);
    console.error(`IP allowlisting: ${ENABLE_IP_ALLOWLIST ? "enabled" : "disabled"}`);
    console.error(
      `HTTPS: ${SSL_KEY_PATH ? "enabled" : "disabled (use reverse proxy in production)"}`,
    );
  } else {
    // Stdio mode uses a single persistent server instance
    const server = createMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Sirv AI MCP Server running via stdio");
  }
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
