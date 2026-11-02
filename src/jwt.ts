import { createHmac } from "node:crypto";
import { jwtVerify } from "jose";

const JWT_ISSUER = "sirv-ai-studio";
const JWT_AUDIENCE = "sirv-ai-mcp";

// MCP_JWT_SECRET keeps MCP tokens apart from app sessions; AUTH_SECRET is the
// fallback until both hosts have it.
function getJwtSecret(): Uint8Array {
  const secret = process.env.MCP_JWT_SECRET || process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "MCP_JWT_SECRET or AUTH_SECRET environment variable is required for token validation",
    );
  }
  return new TextEncoder().encode(secret);
}

/** Studio skips its REST count only on calls that carry this header. */
export const MCP_METERED_HEADER = "X-Sirv-Mcp-Metered";

/**
 * Tells Studio this server already counted the tool call made with `token`.
 * Studio checks it with the same secret, so a client calling Studio directly
 * with its own OAuth token cannot skip the count. Null without a secret: the
 * call is then counted at Studio.
 *
 * ponytail: the signature is bound to the token only, so one leaked value lets
 * that token skip the REST count until it expires (a quota gap, not an auth
 * gap; Sentry strips the header). Bind it to method, path and a time window if
 * the header ever leaves the MCP-server-to-Studio hop.
 */
export function meteredSignature(token: string): string | null {
  const secret = process.env.MCP_JWT_SECRET || process.env.AUTH_SECRET;
  return secret
    ? createHmac("sha256", secret).update(`mcp-metered:${token}`).digest("base64url")
    : null;
}

/**
 * Verify a JWT access token using jose (matches main app implementation).
 * Returns the user ID and scope if valid, null otherwise.
 */
export async function verifyAccessToken(
  token: string,
): Promise<{ userId: string; scope?: string; orgId?: string; clientId?: string } | null> {
  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    if (payload.type !== "mcp_access" || !payload.sub) {
      return null;
    }

    return {
      userId: payload.sub,
      scope: typeof payload.scope === "string" ? payload.scope : undefined,
      orgId: typeof payload.orgId === "string" ? payload.orgId : undefined,
      clientId: typeof payload.clientId === "string" ? payload.clientId : undefined,
    };
  } catch {
    return null;
  }
}
