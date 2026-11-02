import { describe, expect, it, vi } from "vitest";
import { registerSupplierPortalTools } from "../../tools/supplier-portal.js";
import type { ToolContext, ToolServer } from "../../tools/types.js";

function createFakeServer() {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  const configs = new Map<string, Record<string, unknown>>();
  const server = {
    registerTool: vi.fn((name: string, config: Record<string, unknown>, handler: (...args: unknown[]) => Promise<unknown>) => {
      configs.set(name, config);
      handlers.set(name, handler);
      return { name };
    }),
  };

  return {
    configs,
    handlers,
    server: server as unknown as ToolServer,
  };
}

describe("Supplier Portal MCP tools", () => {
  it("registers a Supplier Portal SFTP status tool that returns configured connection details", async () => {
    const { configs, handlers, server } = createFakeServer();
    const getSupplierSftpStatus = vi.fn().mockResolvedValue({
      configured: true,
      host: "sftp.vendor.test",
      rootPath: "/",
      sftpPort: 2022,
      username: "supplier@example.com",
    });
    const context = {
      getApiClient: () => ({ getSupplierSftpStatus }),
    } as unknown as ToolContext;

    registerSupplierPortalTools(server, context);

    const result = await handlers.get("sirv_get_supplier_sftp_status")?.({
      orgId: "org-1",
    });

    expect(configs.get("sirv_get_supplier_sftp_status")).toMatchObject({
      annotations: {
        destructiveHint: false,
        readOnlyHint: true,
      },
      title: "Get Supplier SFTP Status",
    });
    expect(getSupplierSftpStatus).toHaveBeenCalledWith("org-1");
    expect(result).toMatchObject({
      content: [
        {
          text: [
            "Supplier SFTP is configured.",
            "Host: sftp.vendor.test",
            "Port: 2022",
            "Username: supplier@example.com",
            "Root path: /",
          ].join("\n"),
          type: "text",
        },
      ],
      structuredContent: {
        configured: true,
        host: "sftp.vendor.test",
      },
    });
  });

  it("reports when Supplier Portal SFTP is not configured", async () => {
    const { handlers, server } = createFakeServer();
    const getSupplierSftpStatus = vi.fn().mockResolvedValue({
      configured: false,
    });
    const context = {
      getApiClient: () => ({ getSupplierSftpStatus }),
    } as unknown as ToolContext;

    registerSupplierPortalTools(server, context);

    const result = await handlers.get("sirv_get_supplier_sftp_status")?.({});

    expect(getSupplierSftpStatus).toHaveBeenCalledWith(undefined);
    expect(result).toMatchObject({
      content: [
        {
          text: "Supplier SFTP is not configured for this workspace.",
          type: "text",
        },
      ],
      structuredContent: {
        configured: false,
      },
    });
  });

  it("registers a Supplier review-assist requirements tool that summarizes configured rules", async () => {
    const { configs, handlers, server } = createFakeServer();
    const getSupplierSftpStatus = vi.fn();
    const getSupplierReviewAssistRequirements = vi.fn().mockResolvedValue({
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
    });
    const context = {
      getApiClient: () => ({
        getSupplierReviewAssistRequirements,
        getSupplierSftpStatus,
      }),
    } as unknown as ToolContext;

    registerSupplierPortalTools(server, context);

    const result = await handlers.get("sirv_get_supplier_review_assist_requirements")?.({
      orgId: "org-1",
    });

    expect(configs.get("sirv_get_supplier_review_assist_requirements")).toMatchObject({
      annotations: {
        destructiveHint: false,
        readOnlyHint: true,
      },
      title: "Get Supplier Review-Assist Requirements",
    });
    expect(getSupplierReviewAssistRequirements).toHaveBeenCalledWith("org-1");
    expect(result).toMatchObject({
      content: [
        {
          text: [
            "Supplier review-assist requirements: Hero images",
            "Scope: organization",
            "Autofix: enabled",
            "Pass threshold: 0.95",
            "Rules:",
            "- Minimum width: Images must be at least 1200 px wide.",
          ].join("\n"),
          type: "text",
        },
      ],
      structuredContent: {
        hasRequirements: true,
        requirement: {
          autofixEnabled: true,
          specName: "Hero images",
        },
      },
    });
  });

  it("reports when no Supplier review-assist requirements are configured", async () => {
    const { handlers, server } = createFakeServer();
    const getSupplierSftpStatus = vi.fn();
    const getSupplierReviewAssistRequirements = vi.fn().mockResolvedValue({
      hasRequirements: false,
      requirement: null,
    });
    const context = {
      getApiClient: () => ({
        getSupplierReviewAssistRequirements,
        getSupplierSftpStatus,
      }),
    } as unknown as ToolContext;

    registerSupplierPortalTools(server, context);

    const result = await handlers.get("sirv_get_supplier_review_assist_requirements")?.({});

    expect(getSupplierReviewAssistRequirements).toHaveBeenCalledWith(undefined);
    expect(result).toMatchObject({
      content: [
        {
          text: "No Supplier review-assist requirements are configured for this workspace.",
          type: "text",
        },
      ],
      structuredContent: {
        hasRequirements: false,
        requirement: null,
      },
    });
  });

  it("registers a Supplier autofix tool that returns the fixed image result", async () => {
    const { configs, handlers, server } = createFakeServer();
    const runSupplierAutofix = vi.fn().mockResolvedValue({
      image: { url: "https://cdn.test/fixed.png" },
      fixed: true,
      appliedFixes: ["smart_crop"],
      simpleFixes: 1,
      agentFixes: 0,
    });
    const context = {
      getApiClient: () => ({ runSupplierAutofix }),
    } as unknown as ToolContext;

    registerSupplierPortalTools(server, context);

    const result = await handlers.get("sirv_run_supplier_autofix")?.({
      orgId: "org-1",
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
    });

    expect(configs.get("sirv_run_supplier_autofix")).toMatchObject({
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        readOnlyHint: false,
      },
      title: "Run Supplier Autofix",
    });
    expect(runSupplierAutofix).toHaveBeenCalledWith({
      aiModel: "gemini-2-flash",
      enabledFixes: {
        imageToImage: false,
        removeBackground: true,
        smartCrop: true,
        upscale: false,
      },
      failedRules: [
        {
          ruleId: "min-width",
          ruleType: "min_dimension",
          passed: false,
          message: "Image must be at least 1200 px wide.",
          details: { minWidth: 1200 },
        },
      ],
      imageUrl: "https://cdn.test/input.png",
      maxIterations: 2,
      mode: "auto",
      upscaleModel: "esrgan",
    }, "org-1");
    expect(result).toMatchObject({
      content: [
        {
          text: [
            "Supplier autofix completed.",
            "Fixed: yes",
            "Result: https://cdn.test/fixed.png",
            "Applied fixes: smart_crop",
          ].join("\n"),
          type: "text",
        },
      ],
      structuredContent: {
        image: { url: "https://cdn.test/fixed.png" },
        fixed: true,
        appliedFixes: ["smart_crop"],
      },
    });
  });
});
