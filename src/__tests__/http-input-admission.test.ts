import { spawn, type ChildProcess } from "node:child_process";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

const children: ChildProcess[] = [];

async function startMcp(skipAuth = false) {
  const reservation = createServer();
  await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const port = (reservation.address() as AddressInfo).port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: new URL("../..", import.meta.url),
    env: {
      ...process.env,
      NODE_ENV: skipAuth ? "test" : "production",
      MCP_SKIP_AUTH: String(skipAuth),
      MCP_TRANSPORT: "http",
      MCP_HTTP_HOST: "127.0.0.1",
      MCP_HTTP_PORT: String(port),
      MCP_BASE_URL: origin,
      SIRV_AI_BASE_URL: origin,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  await new Promise<void>((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error(`MCP did not start: ${output}`)), 5_000);
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      child.off("exit", exited);
      if (error) reject(error);
      else resolve();
    };
    const exited = () => finish(new Error(`MCP exited before listening: ${output}`));
    child.once("exit", exited);
    child.stderr!.on("data", (chunk) => {
      output += String(chunk);
      if (output.includes("MCP server listening on")) finish();
    });
  });
  return { child, origin };
}

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await exited;
  }
});

describe("MCP HTTP input admission", () => {
  it("refuses compressed bodies before authentication and remains alive after trailing bytes", async () => {
    const { child, origin } = await startMcp();
    const payload = Buffer.concat([gzipSync("{}"), Buffer.from("trailing bytes")]);
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(
        origin,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-encoding": "gzip",
            "content-length": payload.length,
          },
        },
        (response) => {
          response.resume();
          response.once("end", () => resolve(response.statusCode));
        },
      );
      req.once("error", reject);
      req.end(payload);
    });

    expect(status).toBe(415);
    expect((await fetch(`${origin}/health`)).status).toBe(200);
    expect(child.exitCode).toBeNull();
  });

  it("rejects excessive tool elements before building a validation error for every field", async () => {
    const { origin } = await startMcp(true);
    const response = await fetch(origin, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "sirv_update_asset_metadata",
          arguments: {
            id: "asset-1",
            metadata: Object.fromEntries(
              Array.from({ length: 12_000 }, (_, index) => [`field${index}`, 0]),
            ),
          },
        },
      }),
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body.includes("maximum of 10000 elements")).toBe(true);
    expect(body.length).toBeLessThan(1_000);
    expect((await fetch(`${origin}/health`)).status).toBe(200);
  });

  it("rejects JSON beyond one MiB before authentication", async () => {
    const { origin } = await startMcp();
    const response = await fetch(origin, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "x".repeat(1024 * 1024) }),
    });

    expect(response.status).toBe(413);
    expect((await fetch(`${origin}/health`)).status).toBe(200);
  });
});
