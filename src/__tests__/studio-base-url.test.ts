import { describe, expect, it } from "vitest";
import { getStudioBaseUrl } from "../constants.js";

describe("getStudioBaseUrl", () => {
  it("targets production Studio when SIRV_AI_BASE_URL is not set", () => {
    expect(getStudioBaseUrl({})).toBe("https://www.sirv.studio");
  });

  it("uses SIRV_AI_BASE_URL when it is set", () => {
    expect(getStudioBaseUrl({ SIRV_AI_BASE_URL: "http://localhost:3000" })).toBe(
      "http://localhost:3000",
    );
  });
});
