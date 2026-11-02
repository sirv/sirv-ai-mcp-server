import axios, { AxiosError } from "axios";
import { randomUUID } from "node:crypto";
import type {
  ImageResponse,
  CaptionResponse,
  VideoResponse,
  Model3DResponse,
  GlbOptimizeResponse,
  BatchResult,
  UsageStats,
  Organization,
  WorkflowSummary,
  WorkflowDetails,
  WorkflowStep,
  Asset,
  AssetMetadataResponse,
  AssetSearchHit,
  SimilarAssetsResponse,
  Product,
  ProductWithAssets,
  ShopifyStatusResponse,
  ShopifySyncResult,
  ShopifyPushImageResponse,
  SupplierReviewAssistRequirementsResponse,
  SupplierAutofixRequest,
  SupplierAutofixResponse,
  SupplierSftpStatusResponse,
  ToolAuthorizationResult,
} from "./types.js";
import { getValidAccessToken, ensureAuthenticated, clearToken } from "./oauth.js";
import { MCP_METERED_HEADER, meteredSignature } from "./jwt.js";

// Encodes each value as one path segment, so an id like "../products/x" cannot retarget a call.
// URL parsers still resolve a bare "." or ".." segment, even encoded, so those are refused.
const path = (strings: TemplateStringsArray, ...values: string[]) =>
  String.raw(
    { raw: strings },
    ...values.map((value) => {
      if (value === "." || value === "..") throw new Error(`Invalid id: ${value}`);
      return encodeURIComponent(value);
    }),
  );

const DEFAULT_TIMEOUT = 120000;
const LONG_TIMEOUT = 300000;

const DEBUG = process.env.DEBUG === "true" || process.env.DEBUG === "1";

/**
 * Where this client's bearer credential comes from. One client has exactly one
 * source: the previous shape carried three independent fields with a four-way
 * precedence chain, and both construction sites set `useOAuth = !apiKey`, so an
 * HTTP-mode client held a request token AND believed it could run a local OAuth
 * flow. On a 401 that flow spawns a desktop browser on the server.
 */
export type SirvApiAuth =
  | { kind: "apiKey"; apiKey: string }
  // metered: the HTTP lane counted this tool call (http-server.ts).
  | { kind: "requestToken"; token: string; metered?: boolean }
  | { kind: "localOAuth" }
  | { kind: "none" };

export class SirvApiClient {
  private baseUrl: string;
  private auth: SirvApiAuth;

  constructor(baseUrl: string, auth: SirvApiAuth) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.auth = auth;
  }

  private async getAuthHeader(): Promise<string | null> {
    switch (this.auth.kind) {
      case "apiKey":
        return `Bearer ${this.auth.apiKey}`;
      case "requestToken":
        return `Bearer ${this.auth.token}`;
      case "localOAuth": {
        const token = await getValidAccessToken(this.baseUrl);
        return token ? `Bearer ${token}` : null;
      }
      case "none":
        return null;
    }
  }

  // Only a tool call the HTTP lane counted skips Studio's REST meter; Studio
  // counts everything else, including a fail-open meter's calls.
  private meteredHeader(): Record<string, string> {
    if (this.auth.kind !== "requestToken" || !this.auth.metered) return {};
    const signature = meteredSignature(this.auth.token);
    return signature ? { [MCP_METERED_HEADER]: signature } : {};
  }

  async authenticate(): Promise<void> {
    // Only the local (stdio) lane has an interactive flow to run.
    if (this.auth.kind !== "localOAuth") return;
    await ensureAuthenticated(this.baseUrl);
  }

  async authorizeTool(toolName: string): Promise<ToolAuthorizationResult> {
    const authHeader = await this.getAuthHeader();
    if (!authHeader) {
      return {
        allowed: false,
        code: "MCP_AUTH_UNAVAILABLE",
        error: "Authentication is required before MCP tool authorization.",
        toolName,
      };
    }

    const url = `${this.baseUrl}/api/mcp/authorize-tool`;

    try {
      const response = await axios({
        method: "POST",
        url,
        data: { toolName },
        timeout: DEFAULT_TIMEOUT,
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
          ...this.meteredHeader(),
        },
        validateStatus: () => true,
      });

      const data = response.data as Partial<ToolAuthorizationResult> | undefined;
      if (typeof data?.allowed === "boolean") {
        return {
          ...data,
          allowed: data.allowed,
          toolName: data.toolName ?? toolName,
        };
      }

      return {
        allowed: false,
        code:
          typeof data?.code === "string"
            ? data.code
            : "MCP_TOOL_AUTHORIZATION_FAILED",
        error:
          typeof data?.error === "string"
            ? data.error
            : `MCP tool authorization failed (${response.status}).`,
        toolName,
      };
    } catch {
      return {
        allowed: false,
        code: "MCP_TOOL_AUTHORIZATION_FAILED",
        error: "MCP tool authorization failed.",
        toolName,
      };
    }
  }

  private async request<T>(
    endpoint: string,
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE" = "GET",
    data?: Record<string, unknown>,
    timeout: number = DEFAULT_TIMEOUT,
    params?: Record<string, string | number | boolean | undefined>,
    orgId?: string,
    extraHeaders?: Record<string, string>
  ): Promise<T> {
    const authHeader = await this.getAuthHeader();

    // Build query string from params, filtering out undefined values
    let url = `${this.baseUrl}${endpoint}`;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          searchParams.set(key, String(value));
        }
      }
      const qs = searchParams.toString();
      if (qs) url += `?${qs}`;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(authHeader && { Authorization: authHeader }),
      ...this.meteredHeader(),
      ...(orgId && { "X-Org-Id": orgId }),
      ...extraHeaders,
    };

    if (DEBUG) {
      console.error(`[API] ${method} ${url}${orgId ? ` (org: ${orgId})` : ""}`);
      if (data) console.error(`[API] Body: ${JSON.stringify(data).slice(0, 500)}`);
    }

    try {
      const response = await axios({
        method,
        url,
        data,
        timeout,
        headers,
      });
      if (DEBUG) {
        console.error(`[API] ${method} ${url} -> ${response.status}`);
      }
      return response.data;
    } catch (error) {
      // Re-authenticate on 401 ONLY in the local OAuth lane. A request token or
      // an API key cannot be renewed here — the caller owns that credential, and
      // starting the interactive flow would block a server request on a browser.
      if (
        error instanceof AxiosError
        && error.response?.status === 401
        && this.auth.kind === "localOAuth"
      ) {
        await clearToken(this.baseUrl);
        await this.authenticate();
        // Retry the request
        const newAuthHeader = await this.getAuthHeader();
        const response = await axios({
          method,
          url,
          data,
          timeout,
          headers: {
            ...headers,
            ...(newAuthHeader && { Authorization: newAuthHeader }),
          },
        });
        return response.data;
      }
      throw this.handleError(error, url);
    }
  }

  private handleError(error: unknown, url?: string): Error {
    if (error instanceof AxiosError) {
      if (error.response) {
        const status = error.response.status;
        const message = error.response.data?.error || error.response.statusText;
        if (DEBUG || status === 404) {
          console.error(`[API] Error ${status} ${url || error.config?.url}: ${message}`);
          console.error(`[API] Response body:`, JSON.stringify(error.response.data).slice(0, 500));
        }
        switch (status) {
          case 400:
            return new Error(`Bad request: ${message}`);
          case 401:
            return new Error("Authentication required. Please provide a valid API key.");
          case 402:
            // 402 also answers the monthly request limit and a turned-off API.
            return error.response.data?.code === "INSUFFICIENT_CREDITS"
              ? new Error(
                  `This workspace does not have enough credits for this action. Top up: ${this.topUpUrl}`,
                )
              : new Error(message);
          case 403:
            return new Error("Access denied. You don't have permission for this operation.");
          case 404:
            return new Error(`Resource not found: ${message}`);
          case 429:
            return new Error("Rate limit exceeded. Please wait before making more requests.");
          case 500:
            return new Error("Server error. Please try again later.");
          default:
            return new Error(`Request failed (${status}): ${message}`);
        }
      } else if (error.code === "ECONNABORTED") {
        return new Error("Request timed out. The operation may take longer than expected.");
      } else if (error.code === "ECONNREFUSED") {
        return new Error("Could not connect to Sirv AI Studio. Please check the server URL.");
      }
    }
    return new Error(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  }

  private extractImageUrl(data: ImageResponse): string | null {
    if (data.image?.url) return data.image.url;
    if (data.images?.[0]?.url) return data.images[0].url;
    return null;
  }

  private extractImageUrls(data: ImageResponse): string[] {
    if (data.images) {
      return data.images.map((img) => img.url).filter(Boolean);
    }
    if (data.image?.url) return [data.image.url];
    return [];
  }

  async removeBackground(
    imageUrl: string,
    options: {
      provider?: "birefnet" | "bria" | "pixelcut";
      model?: string;
      version?: "v1" | "v2";
      v2Model?: string;
      operatingResolution?: "1024x1024" | "2048x2048" | "2304x2304";
    } = {}
  ): Promise<string> {
    const data = await this.request<ImageResponse>("/api/tools/remove-background", "POST", {
      image_url: imageUrl,
      provider: options.provider,
      model: options.model || "General Use (Heavy)",
      version: options.version,
      v2_model: options.v2Model,
      operating_resolution: options.operatingResolution,
    });
    const url = this.extractImageUrl(data);
    if (!url) throw new Error("No image returned from background removal");
    return url;
  }

  async upscale(
    imageUrl: string,
    options: {
      scale?: number;
      model?: string;
      prompt?: string;
      creativity?: number;
      resemblance?: number;
    } = {}
  ): Promise<string> {
    const data = await this.request<ImageResponse>("/api/tools/upscale", "POST", {
      image_url: imageUrl,
      scale: options.scale ?? 2,
      model: options.model || "esrgan",
      prompt: options.prompt,
      creativity: options.creativity,
      resemblance: options.resemblance,
    });
    const url = this.extractImageUrl(data);
    if (!url) throw new Error("No image returned from upscaling");
    return url;
  }

  async generate(
    prompt: string,
    options: {
      model?: string;
      aspectRatio?: string;
      numImages?: number;
    } = {}
  ): Promise<string[]> {
    const data = await this.request<ImageResponse>(
      "/api/tools/generate",
      "POST",
      {
        prompt,
        model: options.model || "nano-banana-2-lite",
        aspect_ratio: options.aspectRatio || "1:1",
        num_images: options.numImages ?? 1,
      },
      LONG_TIMEOUT
    );
    const urls = this.extractImageUrls(data);
    if (urls.length === 0) throw new Error("No images returned from generation");
    return urls;
  }

  async imageToImage(
    imageUrl: string,
    prompt: string,
    options: {
      strength?: number;
      model?: string;
    } = {}
  ): Promise<string> {
    const data = await this.request<ImageResponse>("/api/tools/image-to-image", "POST", {
      image_url: imageUrl,
      prompt,
      strength: options.strength ?? 0.75,
      model: options.model || "nano-banana-lite-edit",
    });
    const url = this.extractImageUrl(data);
    if (!url) throw new Error("No image returned from image-to-image transformation");
    return url;
  }

  async imageTranslation(
    imageUrl: string,
    targetLanguage: string,
    options: {
      sourceLanguage?: string;
      model?: string;
    } = {}
  ): Promise<string> {
    const data = await this.request<ImageResponse>(
      "/api/tools/image-translation",
      "POST",
      {
        image_url: imageUrl,
        target_language: targetLanguage,
        source_language: options.sourceLanguage,
        model: options.model || "nano-banana-lite-edit",
      },
      LONG_TIMEOUT
    );
    const url = this.extractImageUrl(data);
    if (!url) throw new Error("No image returned from image translation");
    return url;
  }

  async backgroundReplace(
    imageUrl: string,
    options: {
      prompt?: string;
      refImageUrl?: string;
      model?: string;
    } = {}
  ): Promise<string> {
    const data = await this.request<ImageResponse>("/api/tools/background-replace", "POST", {
      image_url: imageUrl,
      prompt: options.prompt,
      ref_image_url: options.refImageUrl,
      model: options.model || "nano-banana-lite",
    });
    const url = this.extractImageUrl(data);
    if (!url) throw new Error("No image returned from background replacement");
    return url;
  }

  async objectRemoval(imageUrl: string, maskUrl: string, prompt?: string): Promise<string> {
    // Studio keeps the prompt only in fill mode.
    const data = await this.request<ImageResponse>("/api/tools/object-removal", "POST", {
      image_url: imageUrl,
      mask_url: maskUrl,
      ...(prompt ? { prompt, mode: "fill" } : {}),
    });
    const url = this.extractImageUrl(data);
    if (!url) throw new Error("No image returned from object removal");
    return url;
  }

  async altText(
    imageUrl: string,
    options: {
      detailLevel?: "caption" | "detailed-caption" | "more-detailed-caption";
      model?: string;
    } = {}
  ): Promise<string> {
    const data = await this.request<CaptionResponse>("/api/tools/alt-text", "POST", {
      image_url: imageUrl,
      detail_level: options.detailLevel || "detailed-caption",
      model: options.model,
    });
    return data.caption || data.results || "";
  }

  async depthMap(imageUrl: string): Promise<string> {
    const data = await this.request<ImageResponse>("/api/tools/depth-map", "POST", {
      image_url: imageUrl,
    });
    const url = this.extractImageUrl(data);
    if (!url) throw new Error("No depth map returned");
    return url;
  }

  async productLifestyle(
    imageUrl: string,
    options: {
      model?: string;
      sceneDescription?: string;
      refImageUrl?: string;
      placementType?: string;
      position?: string;
      numResults?: number;
    } = {}
  ): Promise<string[]> {
    const data = await this.request<ImageResponse>("/api/tools/product-lifestyle", "POST", {
      image_url: imageUrl,
      model: options.model,
      scene_description: options.sceneDescription,
      ref_image_url: options.refImageUrl,
      placement_type: options.placementType,
      position: options.position,
      num_results: options.numResults ?? 1,
    });
    return this.extractImageUrls(data);
  }

  async virtualTryOn(personImageUrl: string, garmentImageUrl: string): Promise<string> {
    const data = await this.request<ImageResponse>("/api/tools/virtual-try-on", "POST", {
      person_image_url: personImageUrl,
      garment_image_url: garmentImageUrl,
    });
    const url = this.extractImageUrl(data);
    if (!url) throw new Error("No image returned from virtual try-on");
    return url;
  }

  async imageTo3d(
    imageUrl: string | string[],
    options: {
      model?: string;
      topology?: string;
      targetPolycount?: number;
      enablePbr?: boolean;
    } = {}
  ): Promise<{ modelUrl: string; formats?: Record<string, string>; thumbnail?: string }> {
    const isMultiple = Array.isArray(imageUrl);
    const data = await this.request<Model3DResponse>(
      "/api/tools/image-to-3d",
      "POST",
      {
        ...(isMultiple ? { image_urls: imageUrl } : { image_url: imageUrl }),
        model: options.model || "meshy",
        topology: options.topology,
        target_polycount: options.targetPolycount,
        enable_pbr: options.enablePbr,
      },
      LONG_TIMEOUT
    );

    const formats: Record<string, string> = {};
    if (data.glb?.url) formats.glb = data.glb.url;
    if (data.obj?.url) formats.obj = data.obj.url;
    if (data.fbx?.url) formats.fbx = data.fbx.url;
    if (data.usdz?.url) formats.usdz = data.usdz.url;
    if (data.model_mesh?.url) formats.model = data.model_mesh.url;

    const modelUrl = formats.glb || formats.model || Object.values(formats)[0];
    if (!modelUrl) throw new Error("No 3D model returned");

    return {
      modelUrl,
      formats: Object.keys(formats).length > 0 ? formats : undefined,
      thumbnail: data.thumbnail?.url,
    };
  }

  async optimizeGlb(
    glbUrl: string,
    options: {
      simplifyRatio?: number;
      simplifyError?: number;
      dedup?: boolean;
      prune?: boolean;
      draco?: boolean;
      instance?: boolean;
      flatten?: boolean;
      join?: boolean;
      weld?: boolean;
      quantize?: boolean;
      textureFormat?: "jpeg" | "png" | "webp" | "avif" | null;
      textureSize?: 256 | 512 | 1024 | 2048 | 4096 | null;
    } = {}
  ): Promise<GlbOptimizeResponse> {
    return this.request<GlbOptimizeResponse>(
      "/api/tools/glb-optimize",
      "POST",
      {
        glb_url: glbUrl,
        simplify_ratio: options.simplifyRatio ?? 1,
        simplify_error: options.simplifyError ?? 0.001,
        dedup: options.dedup ?? true,
        prune: options.prune ?? true,
        draco: options.draco ?? true,
        instance: options.instance ?? true,
        flatten: options.flatten ?? true,
        join: options.join ?? true,
        weld: options.weld ?? true,
        quantize: options.quantize ?? true,
        texture_format: options.textureFormat ?? null,
        texture_size: options.textureSize ?? null,
      },
      LONG_TIMEOUT
    );
  }

  async videoGeneration(
    prompt: string,
    options: {
      imageUrl?: string;
      imageUrls?: string[];
      model?: string;
      duration?: string;
      resolution?: string;
      aspectRatio?: string;
      generateAudio?: boolean;
    } = {}
  ): Promise<string> {
    const data = await this.request<VideoResponse>(
      "/api/tools/video-generation",
      "POST",
      {
        prompt,
        image_url: options.imageUrl,
        image_urls: options.imageUrls,
        model: options.model || "veo31",
        duration: options.duration,
        resolution: options.resolution,
        aspect_ratio: options.aspectRatio,
        generate_audio: options.generateAudio,
      },
      LONG_TIMEOUT
    );
    const url = data.video?.url;
    if (!url) throw new Error("No video returned from generation");
    return url;
  }

  async videoUpscale(
    videoUrl: string,
    options: {
      model?: string;
      scale?: number;
      targetResolution?: string;
      sourceWidth: number;
      sourceHeight: number;
      sourceDurationSeconds: number;
      sourceFrameRate?: number;
    }
  ): Promise<string> {
    const data = await this.request<VideoResponse>(
      "/api/tools/video-upscale",
      "POST",
      {
        video_url: videoUrl,
        model: options.model || "seedvr-video",
        scale: options.scale ?? 2,
        target_resolution: options.targetResolution || "auto",
        source_width: options.sourceWidth,
        source_height: options.sourceHeight,
        source_duration_seconds: options.sourceDurationSeconds,
        source_frame_rate: options.sourceFrameRate,
      },
      LONG_TIMEOUT
    );
    const url = data.video?.url;
    if (!url) throw new Error("No video returned from upscaling");
    return url;
  }

  async batchRemoveBackground(
    images: Array<{ id: string; image_url: string }>,
    model: string
  ): Promise<BatchResult[]> {
    const data = await this.request<{ results: BatchResult[] }>(
      "/api/tools/batch-remove-background",
      "POST",
      { images, model },
      LONG_TIMEOUT
    );
    return data.results;
  }

  async batchUpscale(
    images: Array<{ id: string; image_url: string }>,
    options: { scale?: number; model?: string } = {}
  ): Promise<BatchResult[]> {
    const data = await this.request<{ results: BatchResult[] }>(
      "/api/tools/batch-upscale",
      "POST",
      {
        images,
        scale: options.scale ?? 2,
        model: options.model || "esrgan",
      },
      LONG_TIMEOUT
    );
    return data.results;
  }

  // The balance is the one charges use (/api/user/credits, credits:view); a
  // failed read throws, so it never reaches the agent as a balance of zero.
  // The plan name is extra: when it cannot be read it is left out, never
  // guessed. /api/zapier/me answers API keys only; an MCP token reads its
  // workspace's billing status, which needs billing:view.
  async getAccountInfo(): Promise<{ credits: number; tier?: string }> {
    const apiKey =
      this.auth.kind === "apiKey" || (this.auth.kind === "requestToken" && this.auth.token.startsWith("sk_live_"));
    const [balance, tier] = await Promise.all([
      this.request<{ credits: number }>("/api/user/credits"),
      (apiKey
        ? this.request<{ tier: string }>("/api/zapier/me").then((data) => data.tier)
        : this.request<{ tierId: string }>("/api/billing/subscription-status").then((data) => data.tierId)
      ).catch(() => undefined),
    ]);
    return { credits: balance.credits, ...(tier ? { tier } : {}) };
  }

  /** Studio's Buy credits sheet for the signed-in workspace. */
  get topUpUrl(): string {
    return `${this.baseUrl}/settings/billing?tab=credits&buy=1`;
  }

  async getUsageStats(): Promise<UsageStats> {
    const [usage, account] = await Promise.all([
      this.request<{
        totalCredits: number;
        totalOperations: number;
        topOperations: [string, { count: number; credits: number }][];
      }>("/api/user/usage/stats"),
      this.getAccountInfo(),
    ]);
    return {
      credits: account.credits,
      creditsUsed: usage.totalCredits,
      totalOperations: usage.totalOperations,
      ...(account.tier ? { tier: account.tier } : {}),
      topOperations: usage.topOperations,
      topUpUrl: this.topUpUrl,
    };
  }

  async listOrganizations(): Promise<Organization[]> {
    const data = await this.request<{ organizations: Organization[] }>("/api/user/organizations");
    return data.organizations;
  }

  async getSupplierSftpStatus(orgId?: string): Promise<SupplierSftpStatusResponse> {
    return this.request<SupplierSftpStatusResponse>(
      "/api/vendor/sftp",
      "GET",
      undefined,
      DEFAULT_TIMEOUT,
      undefined,
      orgId,
    );
  }

  async getSupplierReviewAssistRequirements(
    orgId?: string,
  ): Promise<SupplierReviewAssistRequirementsResponse> {
    return this.request<SupplierReviewAssistRequirementsResponse>(
      "/api/vendor/requirements",
      "GET",
      undefined,
      DEFAULT_TIMEOUT,
      undefined,
      orgId,
    );
  }

  async runSupplierAutofix(
    input: SupplierAutofixRequest,
    orgId?: string,
  ): Promise<SupplierAutofixResponse> {
    const data: Record<string, unknown> = {
      image_url: input.imageUrl,
    };

    if (input.mode !== undefined) data.mode = input.mode;
    if (input.failedRules !== undefined) data.failed_rules = input.failedRules;
    if (input.prompt !== undefined) data.prompt = input.prompt;
    if (input.maxIterations !== undefined) data.max_iterations = input.maxIterations;
    if (input.aiModel !== undefined) data.ai_model = input.aiModel;
    if (input.enabledFixes !== undefined) {
      data.enabled_fixes = {
        upscale: input.enabledFixes.upscale,
        remove_background: input.enabledFixes.removeBackground,
        smart_crop: input.enabledFixes.smartCrop,
        image_to_image: input.enabledFixes.imageToImage,
      };
    }
    if (input.upscaleModel !== undefined) data.upscale_model = input.upscaleModel;

    return this.request<SupplierAutofixResponse>(
      "/api/tools/autofix",
      "POST",
      data,
      LONG_TIMEOUT,
      undefined,
      orgId,
    );
  }

  async listWorkflows(): Promise<WorkflowSummary[]> {
    interface WorkflowRow {
      id: string;
      name: string;
      description?: string;
      steps: WorkflowStep[] | { version: number; steps: WorkflowStep[] };
      created_at: string;
      updated_at: string;
    }

    const data = await this.request<{ workflows: WorkflowRow[] }>("/api/workflows");

    return data.workflows.map((w) => {
      // Handle both linear (array) and graph (v2) workflow formats
      const steps = Array.isArray(w.steps)
        ? w.steps
        : (w.steps as { steps: WorkflowStep[] }).steps || [];

      return {
        id: w.id,
        name: w.name,
        description: w.description,
        stepCount: steps.length,
        stepTypes: steps.map((s) => s.type),
        createdAt: w.created_at,
        updatedAt: w.updated_at,
      };
    });
  }

  async getWorkflow(workflowId: string): Promise<WorkflowDetails> {
    interface WorkflowRow {
      id: string;
      name: string;
      description?: string;
      steps: WorkflowStep[] | { version: number; steps: WorkflowStep[] };
      created_at: string;
      updated_at: string;
    }

    const data = await this.request<{ workflow: WorkflowRow }>(
      path`/api/workflows/${workflowId}`
    );
    const w = data.workflow;

    // Handle both linear (array) and graph (v2) workflow formats
    const steps = Array.isArray(w.steps)
      ? w.steps
      : (w.steps as { steps: WorkflowStep[] }).steps || [];

    return {
      id: w.id,
      name: w.name,
      description: w.description,
      stepCount: steps.length,
      stepTypes: steps.map((s) => s.type),
      steps,
      createdAt: w.created_at,
      updatedAt: w.updated_at,
    };
  }

  // ─── Asset methods ───

  async listAssets(params: {
    search?: string;
    favorite?: boolean;
    tags?: string;
    folderId?: string;
    productId?: string;
    sortBy?: string;
    sortOrder?: string;
    limit?: number;
    offset?: number;
    orgId?: string;
  } = {}): Promise<{ assets: Asset[]; total: number }> {
    return this.request<{ assets: Asset[]; total: number }>(
      "/api/assets", "GET", undefined, DEFAULT_TIMEOUT,
      {
        search: params.search,
        favorite: params.favorite ? "true" : undefined,
        tags: params.tags,
        folderId: params.folderId,
        productId: params.productId,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
        limit: params.limit,
        offset: params.offset,
      },
      params.orgId
    );
  }

  async getAsset(id: string, orgId?: string): Promise<Asset> {
    return this.request<Asset>(path`/api/assets/${id}`, "GET", undefined, DEFAULT_TIMEOUT, undefined, orgId);
  }

  async searchAssets(params: {
    q: string;
    limit?: number;
    offset?: number;
    mimeType?: string;
    sourceTool?: string;
    isFavorite?: boolean;
    orgId?: string;
  }): Promise<{ hits: AssetSearchHit[]; total: number; query: string }> {
    return this.request<{ hits: AssetSearchHit[]; total: number; query: string }>(
      "/api/assets/search", "GET", undefined, DEFAULT_TIMEOUT,
      {
        q: params.q,
        limit: params.limit,
        offset: params.offset,
        mimeType: params.mimeType,
        sourceTool: params.sourceTool,
        isFavorite: params.isFavorite,
      },
      params.orgId
    );
  }

  async findSimilarAssets(
    assetId: string,
    params: {
      limit?: number;
      orgId?: string;
    } = {},
  ): Promise<SimilarAssetsResponse> {
    return this.request<SimilarAssetsResponse>(
      `/api/assets/${encodeURIComponent(assetId)}/similar`,
      "GET",
      undefined,
      DEFAULT_TIMEOUT,
      {
        limit: params.limit,
      },
      params.orgId,
    );
  }

  async updateAsset(id: string, data: {
    filename?: string;
    altText?: string;
    isFavorite?: boolean;
  }, orgId?: string): Promise<Asset> {
    return this.request<Asset>(path`/api/assets/${id}`, "PATCH", data as Record<string, unknown>, DEFAULT_TIMEOUT, undefined, orgId);
  }

  async deleteAsset(id: string, orgId?: string): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>(path`/api/assets/${id}`, "DELETE", undefined, DEFAULT_TIMEOUT, undefined, orgId);
  }

  async getAssetMetadata(id: string, orgId?: string): Promise<AssetMetadataResponse> {
    return this.request<AssetMetadataResponse>(path`/api/assets/${id}/metadata`, "GET", undefined, DEFAULT_TIMEOUT, undefined, orgId);
  }

  async updateAssetMetadata(id: string, data: {
    metadata: Record<string, { value: unknown; type: string }>;
    templateId?: string | null;
  }, orgId?: string): Promise<AssetMetadataResponse> {
    return this.request<AssetMetadataResponse>(
      path`/api/assets/${id}/metadata`, "PATCH", data as Record<string, unknown>, DEFAULT_TIMEOUT, undefined, orgId
    );
  }

  async generateAssetAltText(id: string, options: {
    detailLevel?: string;
  } = {}, orgId?: string): Promise<{ altText: string }> {
    return this.request<{ altText: string }>(
      path`/api/assets/${id}/alt-text`, "POST", options as Record<string, unknown>, DEFAULT_TIMEOUT, undefined, orgId
    );
  }

  async bulkAssetOperation(data: {
    assetIds: string[];
    operation: string;
    tagIds?: string[];
    folderId?: string | null;
  }, orgId?: string): Promise<{ success: boolean; count: number }> {
    return this.request<{ success: boolean; count: number }>(
      "/api/assets/bulk", "POST", data as Record<string, unknown>, DEFAULT_TIMEOUT, undefined, orgId
    );
  }

  async importAssetUrl(data: {
    url: string;
    filename: string;
    fileSize?: number;
  }, orgId?: string): Promise<Asset> {
    return this.request<Asset>(
      "/api/assets/import-url", "POST", data as Record<string, unknown>, DEFAULT_TIMEOUT, undefined, orgId
    );
  }

  // ─── Sirv CDN methods (the workspace's connected Sirv account) ───

  async callSirvCdn(
    action: string,
    data: Record<string, unknown>,
    orgId?: string,
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      path`/api/zapier/sirv/${action}`, "POST", data, DEFAULT_TIMEOUT, undefined, orgId
    );
  }

  // ─── Product methods ───

  async listProducts(params: {
    search?: string;
    status?: string;
    externalSource?: string;
    limit?: number;
    offset?: number;
    sortBy?: string;
    sortOrder?: string;
    orgId?: string;
  } = {}): Promise<{ products: Product[]; total: number }> {
    return this.request<{ products: Product[]; total: number }>(
      "/api/products", "GET", undefined, DEFAULT_TIMEOUT,
      {
        search: params.search,
        status: params.status,
        externalSource: params.externalSource,
        limit: params.limit,
        offset: params.offset,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      },
      params.orgId
    );
  }

  async getProduct(id: string, orgId?: string): Promise<Product> {
    return this.request<Product>(path`/api/products/${id}`, "GET", undefined, DEFAULT_TIMEOUT, undefined, orgId);
  }

  async createProduct(data: {
    sku: string;
    name: string;
    description?: string;
    status?: string;
    externalId?: string;
    externalSource?: string;
    externalUrl?: string;
  }, orgId?: string): Promise<Product> {
    return this.request<Product>("/api/products", "POST", data as Record<string, unknown>, DEFAULT_TIMEOUT, undefined, orgId);
  }

  async updateProduct(id: string, data: {
    sku?: string;
    name?: string;
    description?: string | null;
    status?: string;
    brand?: string | null;
    productCategory?: string | null;
    productType?: string | null;
    tags?: string[];
  }, orgId?: string): Promise<Product> {
    return this.request<Product>(path`/api/products/${id}`, "PATCH", data as Record<string, unknown>, DEFAULT_TIMEOUT, undefined, orgId);
  }

  async deleteProduct(id: string, orgId?: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(path`/api/products/${id}`, "DELETE", undefined, DEFAULT_TIMEOUT, undefined, orgId);
  }

  async searchProducts(params: {
    q: string;
    limit?: number;
    orgId?: string;
  }): Promise<{ products: Product[] }> {
    return this.request<{ products: Product[] }>(
      "/api/products/search", "GET", undefined, DEFAULT_TIMEOUT,
      { q: params.q, limit: params.limit },
      params.orgId
    );
  }

  async listProductsWithAssets(params: {
    search?: string;
    limit?: number;
    offset?: number;
    sortBy?: string;
    sortOrder?: string;
    hideEmpty?: boolean;
    orgId?: string;
  } = {}): Promise<{ products: ProductWithAssets[]; total: number; hasMore: boolean }> {
    return this.request<{ products: ProductWithAssets[]; total: number; hasMore: boolean }>(
      "/api/products/with-assets", "GET", undefined, DEFAULT_TIMEOUT,
      {
        search: params.search,
        limit: params.limit,
        offset: params.offset,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
        hideEmpty: params.hideEmpty !== undefined ? String(params.hideEmpty) : undefined,
      },
      params.orgId
    );
  }

  async linkAssetsToProduct(productId: string, data: {
    assetIds: string[];
    role?: string;
  }, orgId?: string): Promise<{ success: boolean; linked: number }> {
    return this.request<{ success: boolean; linked: number }>(
      path`/api/products/${productId}/assets`, "POST", data as Record<string, unknown>, DEFAULT_TIMEOUT, undefined, orgId
    );
  }

  async bulkProductAction(data: Record<string, unknown>, orgId?: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("/api/products/bulk", "POST", data, DEFAULT_TIMEOUT, undefined, orgId);
  }

  // ─── Shopify methods ───

  async getShopifyStatus(orgId?: string): Promise<ShopifyStatusResponse> {
    return this.request<ShopifyStatusResponse>("/api/shopify/validate", "GET", undefined, DEFAULT_TIMEOUT, undefined, orgId);
  }

  // Shopify writes go through an approved publish plan, never a direct upload.
  async pushImageToShopify(productId: string, data: {
    asset_id: string;
    alt_text?: string;
    set_as_featured?: boolean;
  }, orgId?: string, idempotencyKey: string = randomUUID()): Promise<ShopifyPushImageResponse> {
    return this.request<ShopifyPushImageResponse>(
      `/api/shopify/products/${encodeURIComponent(productId)}/publish`,
      "POST",
      // Add only: replace_all deletes every store image, so the MCP lane never sends it.
      { ...data, product_id: productId, strategy: "add" },
      DEFAULT_TIMEOUT,
      undefined,
      orgId,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async syncShopifyProducts(options: {
    importImages?: boolean;
  } = {}, orgId?: string): Promise<ShopifySyncResult> {
    return this.request<ShopifySyncResult>(
      "/api/shopify/sync-products", "POST", options as Record<string, unknown>, LONG_TIMEOUT, undefined, orgId
    );
  }
}
