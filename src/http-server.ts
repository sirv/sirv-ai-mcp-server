import express, { Request, Response, NextFunction } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import https from "https";
import http from "http";
import fs from "fs";
import { getStudioBaseUrl, REGISTRY_NAME, SERVER_VERSION } from "./constants.js";
import { verifyAccessToken } from "./jwt.js";

// API key validation via main API
// `unavailable` means Studio could not answer (rate limit, outage), so the key
// is neither valid nor invalid and the result must not be cached.
async function validateApiKey(
  apiKey: string,
  baseUrl: string,
): Promise<{ valid: boolean; userId?: string; orgId?: string; unavailable?: boolean }> {
  try {
    const url = `${baseUrl}/api/mcp/validate-key`;
    if (DEBUG) {
      console.error(`[AUTH] Validating API key against ${url}`);
    }
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      const data = (await response.json()) as { valid: boolean; userId?: string; orgId?: string };
      if (DEBUG) {
        console.error(`[AUTH] API key validation result: valid=${data.valid}`);
      }
      return data;
    }
    if (DEBUG) {
      console.error(`[AUTH] API key validation failed: ${response.status} ${response.statusText}`);
    }
    return response.status === 429 || response.status >= 500
      ? { valid: false, unavailable: true }
      : { valid: false };
  } catch (error) {
    if (DEBUG) {
      console.error(
        `[AUTH] API key validation error:`,
        error instanceof Error ? error.message : error,
      );
    }
    return { valid: false, unavailable: true };
  }
}

type McpMeterResponse = {
  code?: string;
  current?: number | null;
  error?: string;
  limit?: number | "custom" | null;
  period?: string;
};

// counted: false is a fail-open; Studio's REST meter then counts the calls.
type McpMeterResult =
  | { allowed: true; counted: boolean }
  | { allowed: false; body: McpMeterResponse; status: number };

const MCP_METER_TIMEOUT_MS = 500;
const MCP_METER_LATENCY_SAMPLE_LIMIT = 200;
const MCP_METER_UNAVAILABLE_BODY = {
  code: "API_MCP_REQUEST_METER_UNAVAILABLE",
  error: "API and MCP request metering is temporarily unavailable. Please retry shortly.",
};
const mcpMeterLatencySamples: number[] = [];

function recordMcpMeterLatency(latencyMs: number): number {
  mcpMeterLatencySamples.push(latencyMs);
  if (mcpMeterLatencySamples.length > MCP_METER_LATENCY_SAMPLE_LIMIT) {
    mcpMeterLatencySamples.shift();
  }

  const sorted = [...mcpMeterLatencySamples].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * 0.99) - 1);
  return sorted[index] ?? latencyMs;
}

function logMcpMeterEvent(message: string, fields: Record<string, unknown>): void {
  console.error(message, JSON.stringify({ source: "mcp", ...fields }));
}

function getErrorClass(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function handleMcpMeterBackendFailure(fields: Record<string, unknown>): McpMeterResult {
  const failClosed = process.env.MCP_METER_FAIL_CLOSED === "true";

  if (failClosed) {
    logMcpMeterEvent("[MCP] meter request failed closed", {
      ...fields,
      failClosed,
    });
    return {
      allowed: false,
      body: MCP_METER_UNAVAILABLE_BODY,
      status: 402,
    };
  }

  // Monthly counters deliberately fail open by default for availability.
  // See docs/plans/quota-enforcement-gaps-2026-06-25.md.
  logMcpMeterEvent("[MCP] meter request failed open", {
    ...fields,
    failClosed,
  });
  return { allowed: true, counted: false };
}

async function readMcpMeterBody(response: globalThis.Response): Promise<McpMeterResponse> {
  try {
    return (await response.json()) as McpMeterResponse;
  } catch {
    return {
      error: `MCP request meter returned ${response.status}.`,
    };
  }
}

export async function meterMcpRequest(
  authHeader: string | undefined,
  baseUrl: string,
  clientIp: string,
): Promise<McpMeterResult> {
  if (!authHeader?.startsWith("Bearer ")) {
    return { allowed: true, counted: false };
  }

  const url = `${baseUrl}/api/mcp/meter-request`;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MCP_METER_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        "X-Forwarded-For": clientIp,
      },
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;
    const p99LatencyMs = recordMcpMeterLatency(latencyMs);

    if (DEBUG) {
      logMcpMeterEvent("[MCP] meter request latency", {
        latencyMs,
        p99LatencyMs,
        status: response.status,
      });
    }

    if (response.ok) {
      return { allowed: true, counted: true };
    }

    if (response.status >= 400 && response.status < 500) {
      return {
        allowed: false,
        body: await readMcpMeterBody(response),
        status: response.status,
      };
    }

    return handleMcpMeterBackendFailure({
      errorClass: "HttpError",
      latencyMs,
      p99LatencyMs,
      status: response.status,
    });
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const p99LatencyMs = recordMcpMeterLatency(latencyMs);
    return handleMcpMeterBackendFailure({
      error: error instanceof Error ? error.message : String(error),
      errorClass: getErrorClass(error),
      latencyMs,
      p99LatencyMs,
    });
  } finally {
    clearTimeout(timeout);
  }
}

const OAUTH_METADATA_CACHE_SECONDS = 3600;

// Anthropic outbound IP ranges (used for MCP tool calls)
// Source: https://docs.anthropic.com/en/docs/resources/support#ip-addresses
const CLAUDE_IP_RANGES = [
  // Primary outbound range
  "160.79.104.0/21",
  // Legacy IPs (phasing out Jan 2026)
  "34.162.46.92/32",
  "34.162.102.82/32",
  "34.162.136.91/32",
  "34.162.142.92/32",
  "34.162.183.95/32",
];

interface HttpServerConfig {
  port: number;
  host?: string;
  baseUrl: string;
  corsOrigins?: string[];
  sslKeyPath?: string;
  sslCertPath?: string;
  enableIpAllowlist?: boolean;
  allowedIps?: string[];
}

// Factory function type for creating MCP server instances
// Receives the request token so tools can authenticate against the backend
type McpServerFactory = (requestToken?: string, metered?: boolean) => McpServer;

type McpCaller = {
  credential: "api_key" | "oauth";
  userId?: string;
  orgId?: string;
  clientId?: string;
};

function toolCallCount(body: unknown): number {
  return (Array.isArray(body) ? body : [body]).filter(
    (message) => (message as { method?: unknown } | null)?.method === "tools/call",
  ).length;
}

/**
 * One line per tool call, so a destructive call can be traced to its user and
 * OAuth client. Never the arguments (image URLs, product data) or the token.
 */
function logToolCalls(body: unknown, caller: McpCaller | undefined) {
  for (const message of Array.isArray(body) ? body : [body]) {
    const call = message as { method?: unknown; params?: { name?: unknown } } | null;
    if (call?.method !== "tools/call") continue;
    // The name is not checked yet; never copy one that is not a tool name.
    const name = call.params?.name;
    const tool =
      typeof name === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(name) ? name : "(invalid)";
    console.error(JSON.stringify({ event: "mcp.tool_call", tool, ...caller }));
  }
}

function ipToNumber(ip: string): bigint {
  const parts = ip.split(".");
  if (parts.length !== 4) return BigInt(-1);
  return parts.reduce((acc, octet) => {
    const num = parseInt(octet, 10);
    if (isNaN(num) || num < 0 || num > 255) return BigInt(-1);
    return (acc << BigInt(8)) + BigInt(num);
  }, BigInt(0));
}

function ipInCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  const bits = parseInt(bitsStr, 10);
  if (isNaN(bits) || bits < 0 || bits > 32) return false;

  const mask =
    bits === 0 ? BigInt(0) : ~((BigInt(1) << BigInt(32 - bits)) - BigInt(1)) & BigInt(0xffffffff);
  const ipNum = ipToNumber(ip);
  const rangeNum = ipToNumber(range);

  if (ipNum < 0 || rangeNum < 0) return false;

  return (ipNum & mask) === (rangeNum & mask);
}

function isAllowedIp(ip: string, allowedRanges: string[]): boolean {
  const cleanIp = ip.replace(/^::ffff:/, "");

  if (cleanIp === "127.0.0.1" || cleanIp === "::1") {
    return true;
  }

  for (const range of allowedRanges) {
    if (range.includes("/")) {
      if (ipInCidr(cleanIp, range)) return true;
    } else if (cleanIp === range) {
      return true;
    }
  }
  return false;
}

const DEBUG = process.env.DEBUG === "true" || process.env.DEBUG === "1";

export function createHttpServer(serverFactory: McpServerFactory, config: HttpServerConfig) {
  const app = express();

  // Trust proxy headers for correct client IP detection when behind a reverse proxy
  // This is required for IP allowlisting to work correctly in production
  // Set to 1 to trust the first proxy (typical for single reverse proxy setup)
  // Set to 'loopback' to only trust local proxies
  const trustProxy = process.env.MCP_TRUST_PROXY || "loopback";
  app.set(
    "trust proxy",
    trustProxy === "true" ? true : trustProxy === "false" ? false : trustProxy,
  );

  // Skip auth in development mode for local testing with MCP Inspector
  const skipAuth = process.env.MCP_SKIP_AUTH === "true";
  if (skipAuth && process.env.NODE_ENV === "production") {
    throw new Error("MCP_SKIP_AUTH cannot be true in production");
  }
  if (skipAuth) {
    console.error("⚠️  WARNING: Auth disabled (MCP_SKIP_AUTH=true) - for local testing only!");
  }

  const allowedOrigins = config.corsOrigins || [
    "https://claude.ai",
    "https://console.anthropic.com",
    "https://chatgpt.com",
    "https://chat.openai.com",
    "https://openai.com",
    "https://platform.openai.com",
    "*.openai.com",
    config.baseUrl,
  ];

  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;

    if (origin) {
      const isAllowed = allowedOrigins.some((allowed) => {
        if (allowed === "*") return true;
        if (allowed === origin) return true;
        if (allowed.startsWith("*.")) {
          const suffix = allowed.slice(1);
          try {
            const originHost = new URL(origin).hostname;
            return originHost.endsWith(suffix) && originHost.length > suffix.length;
          } catch {
            return false;
          }
        }
        return false;
      });

      if (isAllowed) {
        res.setHeader("Access-Control-Allow-Origin", origin);
      } else if (skipAuth) {
        // Without auth, a web page could drive the local user's credentials (DNS rebinding).
        // ponytail: with auth on, a bearer token is required and server-side connectors may send
        // an unlisted Origin, so refusing every foreign Origin there needs a client survey first.
        res.status(403).json({ error: "Origin not allowed" });
        return;
      }
    }

    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Accept, MCP-Session-ID",
    );
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Expose-Headers", "MCP-Session-ID");
    res.setHeader("Access-Control-Max-Age", "86400");

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  });

  if (config.enableIpAllowlist) {
    const allowedRanges = [...CLAUDE_IP_RANGES, ...(config.allowedIps || [])];

    app.use((req: Request, res: Response, next: NextFunction) => {
      const clientIp = req.ip || req.socket.remoteAddress || "";

      if (!isAllowedIp(clientIp, allowedRanges)) {
        console.error(`Blocked request from IP: ${clientIp}`);
        res.status(403).json({ error: "IP not allowed" });
        return;
      }

      next();
    });
  }

  // Content Security Policy for OpenAI Apps SDK compliance
  // Restricts resources to only domains we use: sirv.studio, sirv.com, fal.ai
  const cspPolicy = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https://*.sirv.com https://*.fal.ai https://fal.media https://v3.fal.media data: blob:",
    "connect-src 'self' https://www.sirv.studio https://*.sirv.com https://*.fal.ai",
    "frame-ancestors 'self' https://chatgpt.com https://chat.openai.com https://platform.openai.com https://*.openai.com https://claude.ai",
  ].join("; ");

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Content-Security-Policy", cspPolicy);

    if (config.sslKeyPath && config.sslCertPath) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    next();
  });

  // OAuth Authorization Server URL (the main app handles OAuth)
  const oauthServerUrl = getStudioBaseUrl();

  // OpenAI plugin domain verification: the body is the portal token, nothing else.
  app.get("/.well-known/openai-apps-challenge", (req: Request, res: Response) => {
    const token = process.env.OPENAI_APPS_CHALLENGE;
    if (!token) {
      res.status(404).end();
      return;
    }
    res.type("text/plain").send(token);
  });

  app.get("/.well-known/oauth-authorization-server", (req: Request, res: Response) => {
    res.setHeader("Cache-Control", `public, max-age=${OAUTH_METADATA_CACHE_SECONDS}`);
    res.json({
      issuer: oauthServerUrl,
      authorization_endpoint: `${oauthServerUrl}/api/mcp/authorize`,
      token_endpoint: `${oauthServerUrl}/api/mcp/token`,
      registration_endpoint: `${oauthServerUrl}/api/mcp/register`,
      token_endpoint_auth_methods_supported: ["none"],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["sirv-ai:read", "sirv-ai:write"],
      service_documentation: `${oauthServerUrl}/docs/developers/mcp`,
    });
  });

  // MCP Server Card (SEP-2127): public, read-only metadata, so any origin may read it.
  const serverCard = JSON.stringify({
    $schema: "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
    name: REGISTRY_NAME,
    title: "Sirv AI Studio",
    description: "AI image, video and 3D tools, assets, products and Shopify for Sirv AI Studio.",
    version: SERVER_VERSION,
    websiteUrl: `${oauthServerUrl}/docs/developers/mcp`,
    repository: { url: "https://github.com/sirv/sirv-ai-mcp-server", source: "github" },
    remotes: [{ type: "streamable-http", url: config.baseUrl, supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS }],
  });
  const sendPublic = (res: Response, type: string, body: string) => {
    res.set({
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": `public, max-age=${OAUTH_METADATA_CACHE_SECONDS}`,
      "Content-Type": type,
    });
    res.send(body);
  };
  // /server-card is the recommended location; the .well-known paths serve older checkers.
  app.get(["/server-card", "/.well-known/mcp", "/.well-known/mcp.json"], (_req: Request, res: Response) =>
    sendPublic(res, "application/mcp-server-card+json", serverCard),
  );
  app.get("/.well-known/ai-catalog.json", (_req: Request, res: Response) =>
    sendPublic(
      res,
      "application/ai-catalog+json",
      JSON.stringify({
        specVersion: "1.0",
        entries: [
          {
            identifier: "urn:air:sirv.studio:mcp:sirv-ai-studio",
            type: "application/mcp-server-card+json",
            url: `${config.baseUrl}/server-card`,
          },
        ],
      }),
    ),
  );

  app.get("/.well-known/oauth-protected-resource", (req: Request, res: Response) => {
    res.setHeader("Cache-Control", `public, max-age=${OAUTH_METADATA_CACHE_SECONDS}`);
    // OAuth 2.0 Protected Resource Metadata per RFC 9728
    res.json({
      resource: config.baseUrl,
      authorization_servers: [oauthServerUrl],
      scopes_supported: ["sirv-ai:read", "sirv-ai:write"],
      bearer_methods_supported: ["header"],
      resource_documentation: `${oauthServerUrl}/docs/developers/mcp`,
      mcp_protocol_version: "2025-06-18",
      resource_type: "mcp-server",
    });
  });

  if (DEBUG) {
    app.use((req: Request, _res: Response, next: NextFunction) => {
      console.error(`[HTTP] ${req.method} ${req.path} (ip: ${req.ip})`);
      next();
    });
  }

  // MCP clients send plain JSON; refusing compression also avoids decoder errors before auth.
  app.use(express.json({ limit: "1mb", inflate: false }));

  const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
  const RATE_LIMIT_WINDOW_MS = 60000;
  const RATE_LIMIT_MAX_REQUESTS = 100;
  const RATE_LIMIT_MAX_ENTRIES = 10000; // Maximum unique IPs to track

  function checkRateLimit(ip: string, max = RATE_LIMIT_MAX_REQUESTS): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);

    if (!entry || now > entry.resetAt) {
      // Before adding a new entry, check if we need to evict old ones
      if (rateLimitMap.size >= RATE_LIMIT_MAX_ENTRIES) {
        // Evict expired entries first
        for (const [key, val] of rateLimitMap.entries()) {
          if (now > val.resetAt) {
            rateLimitMap.delete(key);
          }
          // Stop if we've freed enough space
          if (rateLimitMap.size < RATE_LIMIT_MAX_ENTRIES * 0.9) break;
        }
        // If still at max, evict oldest entries (first in map)
        if (rateLimitMap.size >= RATE_LIMIT_MAX_ENTRIES) {
          const keysToDelete = Array.from(rateLimitMap.keys()).slice(
            0,
            Math.floor(RATE_LIMIT_MAX_ENTRIES * 0.1),
          );
          for (const key of keysToDelete) {
            rateLimitMap.delete(key);
          }
        }
      }
      rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
      return true;
    }

    if (entry.count >= max) {
      return false;
    }

    entry.count++;
    return true;
  }

  // Invalid API keys are limited per IP, so fake keys cannot flood Studio's key check.
  // Signed-in traffic is limited per caller: Claude and ChatGPT reach us from a few shared IPs.
  const KEY_FAILURES_PER_MINUTE = 30;
  const clientIpOf = (req: Request) => req.ip || req.socket.remoteAddress || "unknown";
  const keyFailureKey = (req: Request) => `key-fail:${clientIpOf(req)}`;
  const refundKeySlot = (req: Request) => {
    const entry = rateLimitMap.get(keyFailureKey(req));
    if (entry && entry.count > 0) entry.count--;
  };

  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap.entries()) {
      if (now > entry.resetAt) {
        rateLimitMap.delete(ip);
      }
    }
    for (const [key, entry] of apiKeyCache.entries()) {
      if (now > entry.expiresAt) {
        apiKeyCache.delete(key);
      }
    }
  }, 60000).unref();

  // HEAD endpoint for MCP protocol discovery (required by claude.ai)
  app.head("/", (req: Request, res: Response) => {
    res.setHeader("MCP-Protocol-Version", "2025-06-18");
    res.status(200).end();
  });

  // Cache for valid API keys only (short TTL to balance performance and security)
  const apiKeyCache = new Map<string, { userId?: string; orgId?: string; expiresAt: number }>();
  const API_KEY_CACHE_TTL = 30 * 1000; // 30 seconds

  // Every 401 points at the resource metadata so clients can re-run OAuth discovery (RFC 9728).
  const challenge = (error?: string) =>
    `Bearer resource="${config.baseUrl}", resource_metadata="${config.baseUrl}/.well-known/oauth-protected-resource"` +
    (error ? `, error="invalid_token", error_description="${error}"` : "");

  // Authentication middleware for MCP endpoints
  // Returns 401 with WWW-Authenticate to trigger OAuth flow per RFC 9728
  const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    // Skip auth for local development/testing
    if (skipAuth) {
      next();
      return;
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.setHeader("WWW-Authenticate", challenge());
      res.status(401).json({
        error: "unauthorized",
        error_description: "Bearer token required",
      });
      return;
    }

    const token = authHeader.slice(7);

    if (DEBUG) {
      const tokenPreview = token.startsWith("sk_live_")
        ? `sk_live_...${token.slice(-6)}`
        : `${token.slice(0, 10)}...`;
      console.error(
        `[AUTH] Token type: ${token.startsWith("sk_live_") ? "API key" : "JWT"} (${tokenPreview})`,
      );
    }

    // Check if it's an API key (starts with sk_live_)
    if (token.startsWith("sk_live_")) {
      // Check cache first
      const cached = apiKeyCache.get(token);
      if (cached && cached.expiresAt > Date.now()) {
        res.locals.caller = {
          credential: "api_key",
          userId: cached.userId,
          orgId: cached.orgId,
        } satisfies McpCaller;
        next();
        return;
      }

      // Reserve a failure slot before the await, so concurrent fake keys cannot all slip past.
      if (!checkRateLimit(keyFailureKey(req), KEY_FAILURES_PER_MINUTE)) {
        res.status(429).json({ error: "Rate limit exceeded" });
        return;
      }

      // Validate API key via main API
      const apiKeyResult = await validateApiKey(token, oauthServerUrl);

      if (apiKeyResult.unavailable) {
        refundKeySlot(req);
        res.setHeader("Retry-After", "30");
        res.status(503).json({
          error: "temporarily_unavailable",
          error_description: "API key check is unavailable. Try again shortly.",
        });
        return;
      }

      if (apiKeyResult.valid) {
        refundKeySlot(req);
        apiKeyCache.set(token, {
          userId: apiKeyResult.userId,
          orgId: apiKeyResult.orgId,
          expiresAt: Date.now() + API_KEY_CACHE_TTL,
        });
        res.locals.caller = {
          credential: "api_key",
          userId: apiKeyResult.userId,
          orgId: apiKeyResult.orgId,
        } satisfies McpCaller;
        next();
        return;
      }

      res.setHeader("WWW-Authenticate", challenge("Invalid API key"));
      res.status(401).json({
        error: "invalid_token",
        error_description: "Invalid API key",
      });
      return;
    }

    // Validate JWT token
    const tokenData = await verifyAccessToken(token);
    if (!tokenData) {
      res.setHeader("WWW-Authenticate", challenge("Token is invalid or expired"));
      res.status(401).json({
        error: "invalid_token",
        error_description: "Token is invalid or expired",
      });
      return;
    }

    res.locals.caller = {
      credential: "oauth",
      userId: tokenData.userId,
      orgId: tokenData.orgId,
      clientId: tokenData.clientId,
    } satisfies McpCaller;
    next();
  };

  // Stateless MCP request handler
  // Creates a fresh server and transport for each request (no shared state)
  // See: https://github.com/yigitkonur/example-mcp-server-streamable-http-stateless
  const handleMcpRequest = async (req: Request, res: Response) => {
    const clientIp = clientIpOf(req);
    const caller = res.locals.caller as McpCaller | undefined;

    if (!checkRateLimit(`caller:${caller?.userId ?? clientIp}`)) {
      res.status(429).json({ error: "Rate limit exceeded" });
      return;
    }

    // Extract OAuth token from Authorization header to pass to API client
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";

    try {
      // An OAuth tool action is one unit of the monthly API/MCP limit;
      // connecting and listing tools cost nothing. Its Studio calls carry a
      // signed header (api-client.ts) so Studio's REST meter skips them, but
      // only once the meter counted the action. API keys are not counted here:
      // Studio counts them once per counted REST call, so one tool action may
      // cost more than one unit.
      const toolCalls = toolCallCount(req.body);
      // One count per request, so a batch may hold one action.
      if (toolCalls > 1) {
        res.status(400).json({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32600, message: "Send one tools/call per request." },
        });
        return;
      }
      let metered = false;
      if (!skipAuth && !token.startsWith("sk_live_") && toolCalls === 1) {
        const meterResult = await meterMcpRequest(authHeader, oauthServerUrl, clientIp);
        if (!meterResult.allowed) {
          res.status(meterResult.status).json(meterResult.body);
          return;
        }
        metered = meterResult.counted;
      }

      logToolCalls(req.body, caller);

      if (DEBUG) {
        const body = req.body;
        const method = body?.method || "unknown";
        const toolName = body?.params?.name || body?.params?.method;
        console.error(`[MCP] Request: ${method}${toolName ? ` -> ${toolName}` : ""}`);
      }

      // Create fresh server and transport for this request (stateless mode)
      // Pass the token so the API client can authenticate against the backend
      const mcpServer = serverFactory(token || undefined, metered);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Stateless mode - no session tracking
      });

      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);

      // Clean up after response completes to prevent memory leaks
      res.on("close", () => {
        transport.close().catch((err) => {
          // Cleanup errors during close are expected - log but don't fail
          console.error("Transport close error:", err);
        });
        mcpServer.close().catch((err) => {
          // Cleanup errors during close are expected - log but don't fail
          console.error("MCP server close error:", err);
        });
      });
    } catch (error) {
      console.error("MCP request error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  };

  // Root path for MCP (required by claude.ai spec 2025-06-18)
  app.all("/", requireAuth, handleMcpRequest);

  // Legacy /mcp path for backwards compatibility
  app.all("/mcp", requireAuth, handleMcpRequest);

  app.get("/health", (req: Request, res: Response) => {
    res.json({ status: "ok", version: SERVER_VERSION });
  });

  let server: http.Server | https.Server;

  if (config.sslKeyPath && config.sslCertPath) {
    const sslOptions = {
      key: fs.readFileSync(config.sslKeyPath),
      cert: fs.readFileSync(config.sslCertPath),
    };
    server = https.createServer(sslOptions, app);
    console.error(`HTTPS server configured`);
  } else {
    server = http.createServer(app);
    console.error(`HTTP server configured (use reverse proxy for HTTPS in production)`);
  }

  return {
    app,
    server,
    start: () => {
      const host = config.host || "0.0.0.0";
      server.listen(config.port, host, () => {
        console.error(
          `MCP server listening on ${config.sslKeyPath ? "https" : "http"}://${host}:${config.port}`,
        );
        console.error(`OAuth metadata: ${config.baseUrl}/.well-known/oauth-authorization-server`);
        console.error(`MCP endpoint: ${config.baseUrl}/`);
        console.error(`Mode: stateless (fresh server per request)`);
      });
    },
  };
}
