import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Express } from "express";
import { createServer, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpServer, meterMcpRequest } from "../http-server.js";

const mockFetch = vi.fn();
const mockConsoleError = vi.spyOn(console, "error").mockImplementation(() => {});

function response(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

// A real local server carries the request, so Express sees a real socket.
async function postJson(
  app: Express,
  headers: Record<string, string>,
): Promise<{ body: string; status: number | undefined }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await new Promise((resolve, reject) => {
      const request = httpRequest(
        {
          headers: { "content-type": "application/json", ...headers },
          host: "127.0.0.1",
          method: "POST",
          path: "/",
          port: (server.address() as AddressInfo).port,
        },
        (response) => {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => (body += chunk));
          response.on("end", () => resolve({ body, status: response.statusCode }));
        },
      );
      request.on("error", reject);
      request.end(JSON.stringify({ id: 1, jsonrpc: "2.0", method: "tools/list" }));
    });
  } finally {
    server.close();
  }
}

describe("meterMcpRequest", () => {
  beforeEach(() => {
    delete process.env.MCP_METER_FAIL_CLOSED;
    mockFetch.mockReset();
    mockConsoleError.mockClear();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    delete process.env.MCP_METER_FAIL_CLOSED;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns a blocking result when Studio reports the monthly limit is exhausted", async () => {
    mockFetch.mockResolvedValue(response({
      code: "API_MCP_REQUEST_LIMIT_REACHED",
      current: 6,
      error: "API and MCP monthly request limit reached for this workspace.",
      limit: 5,
      period: "2026-06",
    }, { status: 402 }));

    await expect(
      meterMcpRequest(
        "Bearer sk_live_limited",
        "https://studio.test",
        "203.0.113.10",
      ),
    ).resolves.toEqual({
      allowed: false,
      body: {
        code: "API_MCP_REQUEST_LIMIT_REACHED",
        current: 6,
        error: "API and MCP monthly request limit reached for this workspace.",
        limit: 5,
        period: "2026-06",
      },
      status: 402,
    });
  });

  it("does not cache successful meter responses", async () => {
    mockFetch.mockResolvedValue(response({ allowed: true }));

    await meterMcpRequest(
      "Bearer sk_live_active",
      "https://studio.test",
      "203.0.113.10",
    );
    await meterMcpRequest(
      "Bearer sk_live_active",
      "https://studio.test",
      "203.0.113.10",
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "https://studio.test/api/mcp/meter-request",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk_live_active",
        }),
      }),
    );
  });

  it("fails open and logs latency context when the meter endpoint times out", async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        }),
    );

    const result = meterMcpRequest(
      "Bearer sk_live_active",
      "https://studio.test",
      "203.0.113.10",
    );

    await vi.advanceTimersByTimeAsync(500);

    await expect(result).resolves.toEqual({ allowed: true, counted: false });
    expect(mockConsoleError).toHaveBeenCalledWith(
      "[MCP] meter request failed open",
      expect.stringContaining('"source":"mcp"'),
    );
    expect(mockConsoleError).toHaveBeenCalledWith(
      "[MCP] meter request failed open",
      expect.stringContaining("p99LatencyMs"),
    );
  });

  it("fails open and logs structured context when the meter backend returns 5xx by default", async () => {
    mockFetch.mockResolvedValue(response({ error: "backend down" }, { status: 503 }));

    await expect(
      meterMcpRequest(
        "Bearer sk_live_active",
        "https://studio.test",
        "203.0.113.10",
      ),
    ).resolves.toEqual({ allowed: true, counted: false });

    expect(mockConsoleError).toHaveBeenCalledWith(
      "[MCP] meter request failed open",
      expect.stringContaining('"failClosed":false'),
    );
    expect(mockConsoleError).toHaveBeenCalledWith(
      "[MCP] meter request failed open",
      expect.stringContaining('"status":503'),
    );
  });

  it("denies meter backend failures when MCP_METER_FAIL_CLOSED is true", async () => {
    process.env.MCP_METER_FAIL_CLOSED = "true";
    mockFetch.mockResolvedValue(response({ error: "backend down" }, { status: 503 }));

    await expect(
      meterMcpRequest(
        "Bearer sk_live_active",
        "https://studio.test",
        "203.0.113.10",
      ),
    ).resolves.toEqual({
      allowed: false,
      body: {
        code: "API_MCP_REQUEST_METER_UNAVAILABLE",
        error: "API and MCP request metering is temporarily unavailable. Please retry shortly.",
      },
      status: 402,
    });
  });
});

describe("createHttpServer MCP metering", () => {
  beforeEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.MCP_SKIP_AUTH;
    delete process.env.MCP_METER_FAIL_CLOSED;
    process.env.SIRV_AI_BASE_URL = "https://studio.test";
    mockFetch.mockReset();
    mockConsoleError.mockClear();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.SIRV_AI_BASE_URL;
    delete process.env.MCP_SKIP_AUTH;
    delete process.env.MCP_METER_FAIL_CLOSED;
    vi.unstubAllGlobals();
  });

  it("throws at startup when MCP_SKIP_AUTH is enabled in production", () => {
    process.env.NODE_ENV = "production";
    process.env.MCP_SKIP_AUTH = "true";

    expect(() => createHttpServer(
      () => new McpServer({ name: "test", version: "1.0.0" }),
      {
        baseUrl: "http://mcp.test",
        port: 0,
      },
    )).toThrow("MCP_SKIP_AUTH cannot be true in production");
  });

  it("allows MCP_SKIP_AUTH outside production with the existing warning", () => {
    process.env.NODE_ENV = "development";
    process.env.MCP_SKIP_AUTH = "true";

    expect(() => createHttpServer(
      () => new McpServer({ name: "test", version: "1.0.0" }),
      {
        baseUrl: "http://mcp.test",
        port: 0,
      },
    )).not.toThrow();
    expect(mockConsoleError).toHaveBeenCalledWith(
      "⚠️  WARNING: Auth disabled (MCP_SKIP_AUTH=true) - for local testing only!",
    );
  });

  it("does not count invalid API keys", async () => {
    mockFetch.mockResolvedValue(response({ valid: false }));
    const { app } = createHttpServer(
      () => ({
        close: vi.fn().mockResolvedValue(undefined),
        connect: vi.fn().mockResolvedValue(undefined),
      }) as never,
      {
        baseUrl: "http://mcp.test",
        port: 0,
      },
    );

    const result = await postJson(app, {
      Authorization: "Bearer sk_live_invalid",
    });

    expect(result.status).toBe(401);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      "https://studio.test/api/mcp/validate-key",
    );
  });

  it.each([429, 503])(
    "answers a %s from key validation as a retryable outage, not an invalid key",
    async (status) => {
      mockFetch.mockResolvedValue(response({ error: "busy" }, { status }));
      const { app } = createHttpServer(
        () => ({
          close: vi.fn().mockResolvedValue(undefined),
          connect: vi.fn().mockResolvedValue(undefined),
        }) as never,
        {
          baseUrl: "http://mcp.test",
          port: 0,
        },
      );

      const result = await postJson(app, {
        Authorization: "Bearer sk_live_real_key",
      });

      expect(result.status).toBe(503);
      expect(result.body).not.toContain("Invalid API key");
    },
  );

  // An API key's REST calls are counted by Studio, and listing tools costs nothing.
  it("leaves an API key's tools/list unmetered after local auth", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/api/mcp/validate-key")) {
        return response({ userId: "user-1", valid: true });
      }

      if (url.endsWith("/api/mcp/meter-request")) {
        return response({
          allowed: true,
          current: 1,
          limit: 25_000,
          period: "2026-06",
        });
      }

      return response({}, { status: 404 });
    });
    const { app } = createHttpServer(
      () => new McpServer({ name: "test", version: "1.0.0" }),
      {
        baseUrl: "http://mcp.test",
        port: 0,
      },
    );

    await postJson(app, {
      Authorization: "Bearer sk_live_active",
    });

    expect(mockFetch.mock.calls.map((call) => call[0])).toEqual([
      "https://studio.test/api/mcp/validate-key",
    ]);
  });
});
