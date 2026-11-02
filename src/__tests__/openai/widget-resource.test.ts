import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerWidgetResource } from "../../openai/widget-resource.js";
import { WIDGET_URI } from "../../openai/meta.js";

describe("registerWidgetResource", () => {
  let mockServer: {
    registerResource: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockServer = {
      registerResource: vi.fn(),
    };
  });

  it("registers resource with correct name and URI", () => {
    registerWidgetResource(mockServer as never);

    expect(mockServer.registerResource).toHaveBeenCalledOnce();
    expect(mockServer.registerResource).toHaveBeenCalledWith(
      "sirv-studio-widget",
      WIDGET_URI,
      expect.any(Object),
      expect.any(Function)
    );
  });

  it("uses the MCP Apps MIME type", () => {
    registerWidgetResource(mockServer as never);

    const [, , metadata] = mockServer.registerResource.mock.calls[0];
    expect(metadata.mimeType).toBe("text/html;profile=mcp-app");
  });

  it("includes description in metadata", () => {
    registerWidgetResource(mockServer as never);

    const [, , metadata] = mockServer.registerResource.mock.calls[0];
    expect(metadata.description).toContain("Sirv AI Studio");
    expect(metadata.description).toContain("widget");
  });

  it("handler returns correct content structure", async () => {
    registerWidgetResource(mockServer as never);

    const handler = mockServer.registerResource.mock.calls[0][3];
    const result = await handler();

    expect(result).toHaveProperty("contents");
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0]).toHaveProperty("uri", WIDGET_URI);
    expect(result.contents[0]).toHaveProperty("mimeType", "text/html;profile=mcp-app");
    expect(result.contents[0]).toHaveProperty("text");
    expect(result.contents[0]).toHaveProperty("_meta");
  });

  it("handler returns HTML content", async () => {
    registerWidgetResource(mockServer as never);

    const handler = mockServer.registerResource.mock.calls[0][3];
    const result = await handler();

    expect(result.contents[0].text).toContain("<!DOCTYPE html>");
    expect(result.contents[0].text).toContain("<html");
  });

  it("declares the border, CSP, and domain in standard and ChatGPT keys", async () => {
    registerWidgetResource(mockServer as never, "https://mcp-dev.sirv.studio");

    const handler = mockServer.registerResource.mock.calls[0][3];
    const meta = (await handler()).contents[0]._meta;

    expect(meta.ui.prefersBorder).toBe(true);
    expect(meta.ui.domain).toBe("https://mcp-dev.sirv.studio");
    expect(meta.ui.csp.connectDomains).toEqual([]);
    expect(meta.ui.csp.resourceDomains).toContain("https://assets.sirv.studio");
    expect(meta.ui.csp.resourceDomains).toContain("https://*.fal.media");
    expect(meta["openai/widgetPrefersBorder"]).toBe(true);
    expect(meta["openai/widgetDomain"]).toBe("https://mcp-dev.sirv.studio");
    expect(meta["openai/widgetCSP"]).toEqual({
      connect_domains: meta.ui.csp.connectDomains,
      resource_domains: meta.ui.csp.resourceDomains,
    });
  });

  it("omits the domain when no public base URL exists", async () => {
    registerWidgetResource(mockServer as never);

    const handler = mockServer.registerResource.mock.calls[0][3];
    const meta = (await handler()).contents[0]._meta;

    expect(meta.ui).not.toHaveProperty("domain");
    expect(meta).not.toHaveProperty("openai/widgetDomain");
  });
});
