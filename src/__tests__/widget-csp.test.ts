import { describe, expect, it } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerWidgetResource } from "../openai/widget-resource.js";

type WidgetContent = { text: string; _meta: { ui: { csp: { resourceDomains: string[] } } } };

async function widget(): Promise<WidgetContent> {
  let read: (() => Promise<{ contents: WidgetContent[] }>) | undefined;
  registerWidgetResource({
    registerResource: (_name: string, _uri: string, _config: unknown, handler: typeof read) => {
      read = handler;
    },
  } as unknown as McpServer);
  const result = await read?.();
  if (!result) throw new Error("widget resource not registered");
  return result.contents[0];
}

// The HTML carries its own CSP, which the browser enforces next to the host's.
// An image domain missing from it stays blank in ChatGPT.
describe("widget CSP", () => {
  it("lets the HTML show images from every resource domain", async () => {
    const { text, _meta } = await widget();
    const imgSrc = text.match(/img-src([^;]*);/)?.[1].trim().split(/\s+/) ?? [];

    expect(imgSrc).toEqual(expect.arrayContaining(_meta.ui.csp.resourceDomains));
  });
});
