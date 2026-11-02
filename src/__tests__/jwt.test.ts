import { SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyAccessToken } from "../jwt.js";

const AUTH_SECRET = "auth-secret-32-bytes-long-enough!!";
const MCP_SECRET = "mcp-secret-32-bytes-long-enough!!!";

function sign(secret: string) {
  return new SignJWT({ sub: "user-1", type: "mcp_access", scope: "full" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .setIssuer("sirv-ai-studio")
    .setAudience("sirv-ai-mcp")
    .sign(new TextEncoder().encode(secret));
}

afterEach(() => vi.unstubAllEnvs());

describe("verifyAccessToken", () => {
  it("verifies with MCP_JWT_SECRET when it is set, and refuses AUTH_SECRET tokens", async () => {
    vi.stubEnv("AUTH_SECRET", AUTH_SECRET);
    vi.stubEnv("MCP_JWT_SECRET", MCP_SECRET);

    await expect(verifyAccessToken(await sign(MCP_SECRET))).resolves.toEqual({
      userId: "user-1",
      scope: "full",
    });
    await expect(verifyAccessToken(await sign(AUTH_SECRET))).resolves.toBeNull();
  });

  it("falls back to AUTH_SECRET when MCP_JWT_SECRET is not set", async () => {
    vi.stubEnv("AUTH_SECRET", AUTH_SECRET);
    vi.stubEnv("MCP_JWT_SECRET", "");

    await expect(verifyAccessToken(await sign(AUTH_SECRET))).resolves.toEqual({
      userId: "user-1",
      scope: "full",
    });
  });
});
