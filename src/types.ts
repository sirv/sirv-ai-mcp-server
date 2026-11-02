export interface ApiResponse<T = unknown> {
  success?: boolean;
  error?: string;
  data?: T;
}

export interface ImageResponse {
  image?: { url: string };
  images?: Array<{ url: string }>;
}

export interface CaptionResponse {
  caption?: string;
  results?: string;
}

export interface VideoResponse {
  video?: { url: string };
}

export interface Model3DResponse {
  model_mesh?: { url: string };
  glb?: { url: string };
  obj?: { url: string };
  fbx?: { url: string };
  usdz?: { url: string };
  thumbnail?: { url: string };
}

export interface GlbOptimizeResponse {
  optimizedUrl: string;
  originalSize: number;
  optimizedSize: number;
  reductionPercent: number;
  vertexCount: { before: number; after: number };
  triangleCount: { before: number; after: number };
}

export interface BatchResult {
  id: string;
  status: "success" | "error";
  url?: string;
  error?: string;
}

export interface UsageStats {
  credits: number;
  creditsUsed: number;
  totalOperations: number;
  /** Left out when this sign-in cannot read the plan; never guessed. */
  tier?: string;
  topOperations: [string, { count: number; credits: number }][];
  /** Studio page where the workspace buys more credits. */
  topUpUrl: string;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  description?: string;
  stepCount: number;
  stepTypes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStep {
  id: string;
  type: string;
  config: Record<string, unknown>;
  variations?: number;
}

export interface WorkflowDetails extends WorkflowSummary {
  steps: WorkflowStep[];
}

// ─── Asset types ───

export interface Asset {
  [key: string]: unknown;
  id: string;
  url: string;
  thumbnailUrl?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  fileSize?: number | null;
  altText?: string | null;
  isFavorite: boolean;
  source?: string | null;
  sourceTool?: string | null;
  folderId?: string | null;
  tags?: Array<{ id: string; name: string }>;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface AssetMetadataResponse {
  [key: string]: unknown;
  metadata: Record<string, { value: unknown; type: string }>;
  templateId?: string | null;
  template?: unknown;
}

export interface AssetSearchHit {
  id: string;
  filename: string | null;
  altText: string | null;
  mimeType: string | null;
  sourceTool: string | null;
  tags: string[];
  isFavorite: boolean;
  createdAt: number;
}

export interface SimilarAssetMatch {
  asset: Asset;
  score: number;
}

export interface SimilarAssetsResponse {
  [key: string]: unknown;
  assetId: string;
  results: SimilarAssetMatch[];
  sameOrg: boolean;
}

export interface ToolAuthorizationResult {
  [key: string]: unknown;
  allowed: boolean;
  capability?: string;
  code?: string;
  error?: string;
  orgId?: string;
  toolName?: string;
  userId?: string;
}

export type SupplierSftpStatusResponse =
  | {
      [key: string]: unknown;
      configured: false;
    }
  | {
      [key: string]: unknown;
      configured: true;
      host: string;
      rootPath: string;
      sftpPort: number;
      username: string;
    };

export interface SupplierRequirementRule {
  [key: string]: unknown;
  description: string;
  label: string;
  type: string;
}

export interface SupplierReviewAssistRequirement {
  [key: string]: unknown;
  autofixEnabled: boolean | null;
  failAction: "reject" | "warn" | "queue_manual" | null;
  filenamePolicy: Record<string, unknown> | null;
  passThreshold: number;
  rules: SupplierRequirementRule[];
  scope: "organization" | "product" | "product_group";
  specDescription: string | null;
  specName: string;
  strictMode: boolean | null;
  videoAutofixTarget: Record<string, unknown> | null;
}

export interface SupplierReviewAssistRequirementsResponse {
  [key: string]: unknown;
  hasRequirements: boolean;
  requirement: SupplierReviewAssistRequirement | null;
}

export interface SupplierAutofixFailedRule {
  [key: string]: unknown;
  details?: Record<string, unknown>;
  message: string;
  passed: boolean;
  ruleId: string;
  ruleType: string;
}

export interface SupplierAutofixEnabledFixes {
  imageToImage?: boolean;
  removeBackground?: boolean;
  smartCrop?: boolean;
  upscale?: boolean;
}

export interface SupplierAutofixRequest {
  aiModel?: "gemini-2-flash" | "gemini-3-flash";
  enabledFixes?: SupplierAutofixEnabledFixes;
  failedRules?: SupplierAutofixFailedRule[];
  imageUrl: string;
  maxIterations?: number;
  mode?: "auto" | "prompt";
  prompt?: string;
  upscaleModel?: "clarity" | "esrgan" | "topaz";
}

export interface SupplierAutofixResponse {
  [key: string]: unknown;
  agentFixes?: number;
  appliedFixes?: string[];
  error?: string;
  fixed: boolean;
  image: { url: string };
  simpleFixes?: number;
}

// ─── Product types ───

export interface Product {
  [key: string]: unknown;
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  status: "active" | "draft" | "archived";
  brand?: string | null;
  productCategory?: string | null;
  productType?: string | null;
  tags?: string[];
  externalId?: string | null;
  externalSource?: string | null;
  externalUrl?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface ProductAssetData {
  assetId: string;
  role: string;
  position: number;
  variantSku: string | null;
  asset: {
    id: string;
    url: string;
    thumbnailUrl: string | null;
    filename: string | null;
    mimeType: string | null;
    width: number | null;
    height: number | null;
    isFavorite: boolean;
    createdAt: string;
  };
}

export interface ProductWithAssets extends Product {
  assets: ProductAssetData[];
  assetCount: number;
}

// ─── Shopify types ───

export interface ShopifyStatusResponse {
  [key: string]: unknown;
  connected: boolean;
  valid: boolean;
  needsReconnect: boolean;
  error?: string;
  shop?: string;
  shopName?: string;
}

/** A durable catalog import; `created` is false when the same import was already running. */
export interface ShopifySyncResult {
  [key: string]: unknown;
  runId: string;
  created: boolean;
  shopDomain: string;
}

/** An approved publish plan and its first run. */
export interface ShopifyPushImageResponse {
  [key: string]: unknown;
  planId: string;
  runId: string;
  status: string;
}

// ─── Organization types ───

export interface Organization {
  id: string;
  name: string;
  slug: string;
  isPersonal: boolean;
  isOwner: boolean;
  role: string;
}

// ─── Shared types ───

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  hasMore?: boolean;
}
