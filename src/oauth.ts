import { createHash, randomBytes } from "crypto";
import { createServer, type Server } from "http";
import { URL } from "url";
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, openSync, closeSync, constants, chmodSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import axios from "axios";

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const CLIENT_ID = "sirv-ai-mcp";
const CONFIG_DIR = join(homedir(), ".sirv-ai");
const TOKEN_FILE = join(CONFIG_DIR, "tokens.json");
const LOCK_FILE = join(CONFIG_DIR, "tokens.lock");
const LOCK_TIMEOUT_MS = 5000; // 5 seconds max wait for lock
const LOCK_RETRY_MS = 50; // Retry every 50ms

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface StoredTokens {
  [baseUrl: string]: TokenData;
}

function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function generateState(): string {
  return randomBytes(16).toString("base64url");
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

// Simple file-based locking to prevent race conditions
async function acquireLock(): Promise<boolean> {
  ensureConfigDir();
  const startTime = Date.now();

  while (Date.now() - startTime < LOCK_TIMEOUT_MS) {
    try {
      // Try to create lock file exclusively with secure permissions
      const fd = openSync(LOCK_FILE, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
      closeSync(fd);
      return true;
    } catch (err) {
      // Lock file exists, check if it's stale (older than timeout)
      try {
        const stats = existsSync(LOCK_FILE) ? readFileSync(LOCK_FILE, "utf-8") : "";
        const lockTime = parseInt(stats, 10);
        if (!isNaN(lockTime) && Date.now() - lockTime > LOCK_TIMEOUT_MS) {
          // Stale lock, remove it
          try {
            unlinkSync(LOCK_FILE);
          } catch {
            // Ignore removal errors
          }
        }
      } catch {
        // Ignore read errors
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, LOCK_RETRY_MS));
    }
  }

  return false;
}

function releaseLock(): void {
  try {
    unlinkSync(LOCK_FILE);
  } catch {
    // Ignore errors - lock file may not exist
  }
}

function loadTokens(): StoredTokens {
  try {
    if (existsSync(TOKEN_FILE)) {
      const data = readFileSync(TOKEN_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch {
    // Ignore errors, return empty
  }
  return {};
}

async function saveTokensWithLock(tokens: StoredTokens): Promise<void> {
  ensureConfigDir();
  const locked = await acquireLock();
  try {
    // Write timestamp to lock file
    if (locked) {
      writeFileSync(LOCK_FILE, Date.now().toString(), { mode: 0o600 });
    }
    writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  } finally {
    if (locked) {
      releaseLock();
    }
  }
}

export function getStoredToken(baseUrl: string): TokenData | null {
  const tokens = loadTokens();
  return tokens[baseUrl] || null;
}

async function storeToken(baseUrl: string, tokenData: TokenData): Promise<void> {
  const tokens = loadTokens();
  tokens[baseUrl] = tokenData;
  await saveTokensWithLock(tokens);
}

export async function clearToken(baseUrl: string): Promise<void> {
  const tokens = loadTokens();
  delete tokens[baseUrl];
  await saveTokensWithLock(tokens);
}

export async function refreshAccessToken(
  baseUrl: string,
  refreshToken: string
): Promise<TokenData | null> {
  try {
    const response = await axios.post(`${baseUrl}/api/mcp/token`, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    });

    const data = response.data;
    const tokenData: TokenData = {
      accessToken: data.access_token,
      // Use new refresh token if provided (rotation), otherwise keep the old one
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    await storeToken(baseUrl, tokenData);
    return tokenData;
  } catch {
    // Refresh failed, clear tokens
    await clearToken(baseUrl);
    return null;
  }
}

export async function getValidAccessToken(baseUrl: string): Promise<string | null> {
  const stored = getStoredToken(baseUrl);
  if (!stored) return null;

  // Check if token is expired (with 60s buffer)
  if (stored.expiresAt < Date.now() + 60000) {
    const refreshed = await refreshAccessToken(baseUrl, stored.refreshToken);
    return refreshed?.accessToken || null;
  }

  return stored.accessToken;
}

export function startOAuthFlow(baseUrl: string): Promise<TokenData> {
  return new Promise((resolve, reject) => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();

    let port: number;

    // Create local server for callback
    const server = createServer(async (req, res) => {
      const url = new URL(req.url || "/", `http://localhost:${port}`);

      if (url.pathname === "/callback") {
        const code = url.searchParams.get("code");
        const returnedState = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1 style="color: #ef4444;">Authorization Failed</h1>
                <p>Error: ${escapeHtml(error)}</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (returnedState !== state) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1 style="color: #ef4444;">Security Error</h1>
                <p>State mismatch. Please try again.</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error("State mismatch"));
          return;
        }

        if (!code) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1 style="color: #ef4444;">Error</h1>
                <p>No authorization code received.</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error("No authorization code"));
          return;
        }

        // Exchange code for tokens
        try {
          const tokenResponse = await axios.post(`${baseUrl}/api/mcp/token`, {
            grant_type: "authorization_code",
            code,
            code_verifier: codeVerifier,
            redirect_uri: `http://localhost:${port}/callback`,
            client_id: CLIENT_ID,
          });

          const tokenData: TokenData = {
            accessToken: tokenResponse.data.access_token,
            refreshToken: tokenResponse.data.refresh_token,
            expiresAt: Date.now() + tokenResponse.data.expires_in * 1000,
          };

          await storeToken(baseUrl, tokenData);

          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1 style="color: #22c55e;">Success!</h1>
                <p>You have been authenticated with Sirv AI Studio.</p>
                <p>You can close this window and return to your terminal.</p>
                <script>setTimeout(() => window.close(), 2000);</script>
              </body>
            </html>
          `);

          server.close();
          resolve(tokenData);
        } catch (err) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1 style="color: #ef4444;">Token Exchange Failed</h1>
                <p>Could not complete authentication. Please try again.</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(err);
        }
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    // Listen on random port
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (typeof addr === "object" && addr) {
        port = addr.port;

        const redirectUri = `http://localhost:${port}/callback`;
        const authUrl = new URL(`${baseUrl}/api/mcp/authorize`);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("client_id", CLIENT_ID);
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("code_challenge", codeChallenge);
        authUrl.searchParams.set("code_challenge_method", "S256");
        authUrl.searchParams.set("state", state);

        // Open browser using spawn to avoid command injection
        const openBrowser = async () => {
          const { spawn } = await import("child_process");
          const urlString = authUrl.toString();

          let command: string;
          let args: string[];

          if (process.platform === "darwin") {
            command = "open";
            args = [urlString];
          } else if (process.platform === "win32") {
            command = "cmd";
            args = ["/c", "start", "", urlString];
          } else {
            command = "xdg-open";
            args = [urlString];
          }

          const child = spawn(command, args, {
            detached: true,
            stdio: "ignore",
          });

          child.on("error", () => {
            console.error(`\nPlease open this URL in your browser:\n${urlString}\n`);
          });

          child.unref();
          console.error("\nOpening browser for authentication...");
        };

        openBrowser().catch(() => {
          console.error(`\nPlease open this URL in your browser:\n${authUrl.toString()}\n`);
        });

        // Timeout after 5 minutes
        setTimeout(() => {
          server.close();
          reject(new Error("Authentication timed out"));
        }, 5 * 60 * 1000);
      }
    });

    server.on("error", reject);
  });
}

export async function ensureAuthenticated(baseUrl: string): Promise<string> {
  // Try to get a valid token
  const token = await getValidAccessToken(baseUrl);
  if (token) {
    return token;
  }

  // No valid token, start OAuth flow
  console.error("No valid authentication found. Starting OAuth flow...");
  const tokenData = await startOAuthFlow(baseUrl);
  return tokenData.accessToken;
}
