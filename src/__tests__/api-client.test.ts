import axios, { AxiosError } from "axios";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { SirvApiClient } from "../api-client.js";
import { getStoredToken } from "../oauth.js";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "child_process";
import { createHmac } from "node:crypto";

const { testHome } = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  return { testHome: mkdtempSync(join(tmpdir(), "fu-ext-mcp-")) };
});

vi.mock("os", async (importOriginal) => ({
  ...(await importOriginal<typeof import("os")>()),
  homedir: () => testHome,
}));

vi.mock("axios", async (importOriginal) => ({
  ...(await importOriginal<typeof import("axios")>()),
  default: Object.assign(vi.fn(), { post: vi.fn() }),
}));

// The browser boundary follows the actual OAuth redirect to a real loopback
// callback server. Token exchange stays at the Axios HTTP boundary.
vi.mock("child_process", () => ({ spawn: vi.fn() }));
const tokenFile = join(testHome, ".sirv-ai", "tokens.json");
function seedToken() {
  mkdirSync(join(testHome, ".sirv-ai"), { recursive: true });
  writeFileSync(
    tokenFile,
    JSON.stringify({
      "https://studio.test": {
        accessToken: "oauth-token",
        refreshToken: "refresh-token",
        expiresAt: Date.now() + 3_600_000,
      },
    }),
  );
}
function unauthorizedError(): AxiosError {
  return new AxiosError(
    "Unauthorized",
    "ERR_BAD_REQUEST",
    undefined,
    undefined,
    {
      status: 401,
      statusText: "Unauthorized",
      data: {},
      headers: {},
      config: { headers: {} } as never,
    },
  );
}
function expectNoLocalOAuth() {
  expect(axios.post).not.toHaveBeenCalled();
  expect(spawn).not.toHaveBeenCalled();
  expect(getStoredToken("https://studio.test")?.accessToken).toBe(
    "oauth-token",
  );
}

beforeEach(() => {
  vi.mocked(axios).mockReset();
  vi.mocked(axios.post).mockReset();
  vi.mocked(spawn).mockReset();
  seedToken();
});
afterEach(() => {
  vi.useRealTimers();
});
afterAll(() => {
  rmSync(testHome, { recursive: true, force: true });
});

describe("SirvApiClient auth source", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the API key when configured with one", async () => {
    vi.mocked(axios).mockResolvedValue({
      data: { allowed: true },
      status: 200,
    });
    const client = new SirvApiClient("https://studio.test", {
      apiKey: "sk_live_valid",
      kind: "apiKey",
    });

    await client.authorizeTool("sirv_tool");

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk_live_valid",
        }),
      }),
    );
    expectNoLocalOAuth();
  });

  it("uses the per-request token in HTTP mode and never reaches the local OAuth flow", async () => {
    vi.mocked(axios).mockResolvedValue({
      data: { allowed: true },
      status: 200,
    });
    const client = new SirvApiClient("https://studio.test", {
      kind: "requestToken",
      token: "user-jwt",
    });

    await client.authorizeTool("sirv_tool");

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer user-jwt" }),
      }),
    );
    expectNoLocalOAuth();
  });

  // Studio skips its REST count only for calls carrying this signature, so it
  // must ride on HTTP-lane OAuth calls (already counted) and nothing else.
  it("signs only HTTP-lane OAuth calls the meter counted", async () => {
    vi.stubEnv("MCP_JWT_SECRET", "meter-secret");
    vi.mocked(axios).mockResolvedValue({ data: { allowed: true }, status: 200 });
    const meteredHeaderFor = async (auth: ConstructorParameters<typeof SirvApiClient>[1]) => {
      vi.mocked(axios).mockClear();
      await new SirvApiClient("https://studio.test", auth).authorizeTool("sirv_tool");
      const config = vi.mocked(axios).mock.calls[0]?.[0] as unknown as { headers: Record<string, string> };
      return config.headers["X-Sirv-Mcp-Metered"];
    };

    try {
      expect(await meteredHeaderFor({ kind: "requestToken", token: "user-jwt", metered: true })).toBe(
        createHmac("sha256", "meter-secret").update("mcp-metered:user-jwt").digest("base64url"),
      );
      expect(await meteredHeaderFor({ kind: "requestToken", token: "user-jwt" })).toBeUndefined();
      expect(await meteredHeaderFor({ kind: "localOAuth" })).toBeUndefined();
      expect(await meteredHeaderFor({ kind: "apiKey", apiKey: "sk_live_x" })).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("uses the local OAuth token in stdio mode", async () => {
    vi.mocked(axios).mockResolvedValue({
      data: { allowed: true },
      status: 200,
    });
    const client = new SirvApiClient("https://studio.test", {
      kind: "localOAuth",
    });

    await client.authorizeTool("sirv_tool");

    expect(axios.post).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer oauth-token",
        }),
      }),
    );
  });
});

// Owner override 2026-10-31: a short balance links to the workspace's Buy
// credits page in every client, ChatGPT included. The directory submission
// states this link (plan 1473).
describe("SirvApiClient 402 answers", () => {
  function reject402(data: Record<string, unknown>) {
    vi.mocked(axios).mockRejectedValue(
      new AxiosError("Payment Required", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 402,
        statusText: "Payment Required",
        data,
        headers: {},
        config: { headers: {} } as never,
      }),
    );
    return new SirvApiClient("https://studio.test", { kind: "requestToken", token: "jwt" });
  }

  it("links a short credit balance to the workspace's Buy credits page", async () => {
    const client = reject402({ code: "INSUFFICIENT_CREDITS", error: "Insufficient credits" });

    const error = (await client.listOrganizations().catch((e: unknown) => e)) as Error;

    expect(error.message).toContain("https://studio.test/settings/billing?tab=credits&buy=1");
  });

  it("passes other 402 answers through without a credits link", async () => {
    const client = reject402({
      code: "API_MCP_REQUEST_LIMIT_REACHED",
      error: "API and MCP monthly request limit reached for this workspace.",
    });

    const error = (await client.listOrganizations().catch((e: unknown) => e)) as Error;

    expect(error.message).toContain("API and MCP monthly request limit reached");
    expect(error.message).not.toContain("/settings/billing");
  });
});

describe("SirvApiClient 401 handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The 401 retry used to key on a `useOAuth` flag that BOTH constructor call
  // sites set to `!apiKey` — so an HTTP-mode client carrying a user's expired
  // request token would call startOAuthFlow, which spawns a desktop browser ON
  // THE SERVER and blocks for up to five minutes.
  it("does not start a local OAuth flow when a request token expires", async () => {
    vi.mocked(axios).mockRejectedValue(unauthorizedError());
    const client = new SirvApiClient("https://studio.test", {
      kind: "requestToken",
      token: "expired-jwt",
    });

    await expect(client.listOrganizations()).rejects.toThrow();

    expectNoLocalOAuth();
    expect(axios).toHaveBeenCalledTimes(1);
  });

  it("does not start a local OAuth flow when an API key is rejected", async () => {
    vi.mocked(axios).mockRejectedValue(unauthorizedError());
    const client = new SirvApiClient("https://studio.test", {
      apiKey: "sk_live_stale",
      kind: "apiKey",
    });

    await expect(client.listOrganizations()).rejects.toThrow();

    expectNoLocalOAuth();
  });

  it("re-authenticates once on 401 in local OAuth mode", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let callback: Promise<Response> | undefined;
    vi.mocked(spawn).mockImplementation((_command, args) => {
      const authorize = new URL(args![0]);
      const redirect = new URL(authorize.searchParams.get("redirect_uri")!);
      redirect.searchParams.set("state", authorize.searchParams.get("state")!);
      redirect.searchParams.set("code", "new-authorization-code");
      redirect.hostname = "127.0.0.1";
      callback = fetch(redirect);
      return { on: vi.fn(), unref: vi.fn() } as never;
    });
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        access_token: "new-oauth-token",
        refresh_token: "new-refresh-token",
        expires_in: 3600,
      },
    });
    vi.mocked(axios)
      .mockRejectedValueOnce(unauthorizedError())
      .mockResolvedValueOnce({
        data: { organizations: [{ id: "org-1" }] },
        status: 200,
      });
    const client = new SirvApiClient("https://studio.test", {
      kind: "localOAuth",
    });

    await expect(client.listOrganizations()).resolves.toEqual([{ id: "org-1" }]);

    expect(spawn).toHaveBeenCalledTimes(1);
    expect((await callback)?.status).toBe(200);
    expect(axios.post).toHaveBeenCalledWith(
      "https://studio.test/api/mcp/token",
      expect.objectContaining({
        client_id: "sirv-ai-mcp",
        code: "new-authorization-code",
        code_verifier: expect.any(String),
        grant_type: "authorization_code",
        redirect_uri: expect.stringMatching(
          /^http:\/\/localhost:\d+\/callback$/,
        ),
      }),
    );
    expect(getStoredToken("https://studio.test")?.accessToken).toBe(
      "new-oauth-token",
    );
    expect(
      JSON.parse(readFileSync(tokenFile, "utf8"))["https://studio.test"]
        .refreshToken,
    ).toBe("new-refresh-token");
    expect(axios).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer new-oauth-token",
        }),
      }),
    );
    expect(axios).toHaveBeenCalledTimes(2);
  });
});

describe("SirvApiClient MCP authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts the current bearer credential to Studio's tool authorization endpoint", async () => {
    vi.mocked(axios).mockResolvedValue({
      data: {
        allowed: true,
        capability: "asset.visual_similarity.search",
      },
      status: 200,
    });
    const client = new SirvApiClient("https://studio.test", {
      apiKey: "sk_live_valid",
      kind: "apiKey",
    });

    await expect(
      client.authorizeTool("sirv_find_similar_assets"),
    ).resolves.toMatchObject({
      allowed: true,
      capability: "asset.visual_similarity.search",
    });

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { toolName: "sirv_find_similar_assets" },
        headers: {
          Authorization: "Bearer sk_live_valid",
          "Content-Type": "application/json",
        },
        method: "POST",
        url: "https://studio.test/api/mcp/authorize-tool",
      }),
    );
  });

  it("fails closed when no bearer credential is available", async () => {
    const client = new SirvApiClient("https://studio.test", { kind: "none" });

    await expect(
      client.authorizeTool("sirv_find_similar_assets"),
    ).resolves.toMatchObject({
      allowed: false,
      code: "MCP_AUTH_UNAVAILABLE",
    });
    expect(axios).not.toHaveBeenCalled();
  });
});

describe("SirvApiClient Supplier Portal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gets Supplier Portal SFTP status through the vendor SFTP API with org scoping", async () => {
    vi.mocked(axios).mockResolvedValue({
      data: {
        configured: true,
        host: "sftp.vendor.test",
        rootPath: "/",
        sftpPort: 2022,
        username: "supplier@example.com",
      },
      status: 200,
    });
    const client = new SirvApiClient("https://studio.test", {
      apiKey: "sk_live_valid",
      kind: "apiKey",
    });

    await expect(client.getSupplierSftpStatus("org-1")).resolves.toMatchObject({
      configured: true,
      host: "sftp.vendor.test",
      rootPath: "/",
      sftpPort: 2022,
      username: "supplier@example.com",
    });

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          Authorization: "Bearer sk_live_valid",
          "Content-Type": "application/json",
          "X-Org-Id": "org-1",
        },
        method: "GET",
        url: "https://studio.test/api/vendor/sftp",
      }),
    );
  });

  it("gets Supplier Portal review-assist requirements through the vendor requirements API with org scoping", async () => {
    vi.mocked(axios).mockResolvedValue({
      data: {
        hasRequirements: true,
        requirement: {
          autofixEnabled: true,
          failAction: "queue_manual",
          filenamePolicy: null,
          passThreshold: 0.95,
          rules: [
            {
              description: "Images must be at least 1200 px wide.",
              label: "Minimum width",
              type: "min_dimension",
            },
          ],
          scope: "organization",
          specDescription: "Hero image intake rules",
          specName: "Hero images",
          strictMode: true,
          videoAutofixTarget: null,
        },
      },
      status: 200,
    });
    const client = new SirvApiClient("https://studio.test", {
      apiKey: "sk_live_valid",
      kind: "apiKey",
    });

    await expect(
      client.getSupplierReviewAssistRequirements("org-1"),
    ).resolves.toMatchObject({
      hasRequirements: true,
      requirement: {
        autofixEnabled: true,
        specName: "Hero images",
      },
    });

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          Authorization: "Bearer sk_live_valid",
          "Content-Type": "application/json",
          "X-Org-Id": "org-1",
        },
        method: "GET",
        url: "https://studio.test/api/vendor/requirements",
      }),
    );
  });

  it("runs Supplier Portal autofix through the FAL autofix API with org scoping", async () => {
    vi.mocked(axios).mockResolvedValue({
      data: {
        image: { url: "https://cdn.test/fixed.png" },
        fixed: true,
        appliedFixes: ["smart_crop"],
        simpleFixes: 1,
        agentFixes: 0,
      },
      status: 200,
    });
    const client = new SirvApiClient("https://studio.test", {
      apiKey: "sk_live_valid",
      kind: "apiKey",
    });

    await expect(
      client.runSupplierAutofix(
        {
          imageUrl: "https://cdn.test/input.png",
          mode: "auto",
          failedRules: [
            {
              ruleId: "min-width",
              ruleType: "min_dimension",
              passed: false,
              message: "Image must be at least 1200 px wide.",
              details: { minWidth: 1200 },
            },
          ],
          maxIterations: 2,
          aiModel: "gemini-2-flash",
          enabledFixes: {
            upscale: false,
            removeBackground: true,
            smartCrop: true,
            imageToImage: false,
          },
          upscaleModel: "esrgan",
        },
        "org-1",
      ),
    ).resolves.toMatchObject({
      image: { url: "https://cdn.test/fixed.png" },
      fixed: true,
      appliedFixes: ["smart_crop"],
    });

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          image_url: "https://cdn.test/input.png",
          mode: "auto",
          failed_rules: [
            {
              ruleId: "min-width",
              ruleType: "min_dimension",
              passed: false,
              message: "Image must be at least 1200 px wide.",
              details: { minWidth: 1200 },
            },
          ],
          max_iterations: 2,
          ai_model: "gemini-2-flash",
          enabled_fixes: {
            upscale: false,
            remove_background: true,
            smart_crop: true,
            image_to_image: false,
          },
          upscale_model: "esrgan",
        },
        headers: {
          Authorization: "Bearer sk_live_valid",
          "Content-Type": "application/json",
          "X-Org-Id": "org-1",
        },
        method: "POST",
        url: "https://studio.test/api/tools/autofix",
      }),
    );
  });
});
