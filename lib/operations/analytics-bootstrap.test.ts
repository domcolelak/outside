import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { describe, expect, it } from "vitest";

const websiteId = "fdab50fd-2e48-4590-a6d9-7a5979840ed8";

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function body(request: IncomingMessage) {
  let value = "";
  request.setEncoding("utf8");
  for await (const chunk of request) value += chunk;
  return JSON.parse(value) as Record<string, unknown>;
}

describe("analytics bootstrap", () => {
  it("creates and verifies a website when Umami returns 200 with null", async () => {
    let website: Record<string, unknown> | null = null;
    let createRequests = 0;
    const server = createServer(async (request, response) => {
      if (request.method === "POST" && request.url === "/api/auth/login") {
        json(response, 200, { token: "test-token" });
        return;
      }
      if (request.method === "GET" && request.url === `/api/websites/${websiteId}`) {
        json(response, 200, website);
        return;
      }
      if (request.method === "POST" && request.url === "/api/websites") {
        createRequests += 1;
        website = await body(request);
        json(response, 200, website);
        return;
      }
      json(response, 404, { message: "Not found" });
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind to TCP");

    try {
      const child = spawn(process.execPath, ["ops/staging/analytics/bootstrap.mjs"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          UMAMI_INTERNAL_URL: `http://127.0.0.1:${address.port}`,
          UMAMI_ADMIN_PASSWORD: "a-secure-test-password",
          UMAMI_WEBSITE_ID: websiteId,
          UMAMI_SITE_DOMAIN: "outsideguardian.eu",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
      child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
      const [exitCode] = (await once(child, "close")) as [number];

      expect(stderr).toBe("");
      expect(exitCode).toBe(0);
      expect(createRequests).toBe(1);
      expect(website).toEqual({ id: websiteId, name: "OUTSIDE", domain: "outsideguardian.eu" });
      expect(stdout).toContain('"event":"analytics.bootstrap.complete"');
    } finally {
      server.close();
      await once(server, "close");
    }
  });
});
