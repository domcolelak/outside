import https from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import { isSafePublicIp } from "./target";

export interface PinnedHttpsResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

export interface PinnedHttpsOptions {
  path: string;
  method?: "GET" | "POST";
  body?: string;
  timeoutMs?: number;
  maxBodyBytes?: number;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * Connect to a pre-resolved public IP while preserving the original hostname
 * for Host, SNI, and certificate validation. Redirects and DNS re-resolution
 * are impossible inside this connector.
 */
export async function pinnedHttpsGet(
  hostname: string,
  resolvedAddresses: string[],
  options: PinnedHttpsOptions,
): Promise<PinnedHttpsResponse> {
  const addresses = [...new Set(resolvedAddresses)];
  if (addresses.length === 0 || !addresses.every(isSafePublicIp)) {
    throw new Error("Target did not resolve exclusively to public addresses.");
  }

  let lastError: unknown;
  for (const address of addresses) {
    try {
      return await requestAddress(hostname, address, options);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Target HTTPS request failed.");
}

function requestAddress(hostname: string, address: string, options: PinnedHttpsOptions): Promise<PinnedHttpsResponse> {
  const timeoutMs = options.timeoutMs ?? 6_000;
  const maxBodyBytes = options.maxBodyBytes ?? 0;

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const req = https.request(
      {
        hostname: address,
        port: 443,
        method: options.method ?? "GET",
        path: options.path,
        servername: hostname,
        rejectUnauthorized: true,
        agent: false,
        headers: { ...options.headers, host: hostname, ...(options.body ? { "content-length": Buffer.byteLength(options.body) } : {}) },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (maxBodyBytes === 0) {
          const response = { status, headers: res.headers, body: "" };
          res.destroy();
          finish(() => resolve(response));
          return;
        }

        const declared = Number(res.headers["content-length"] ?? 0);
        if (Number.isFinite(declared) && declared > maxBodyBytes) {
          res.destroy();
          finish(() => reject(new Error("Target response exceeded the allowed size.")));
          return;
        }

        const chunks: Buffer[] = [];
        let bytes = 0;
        res.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytes += buffer.length;
          if (bytes > maxBodyBytes) {
            res.destroy();
            finish(() => reject(new Error("Target response exceeded the allowed size.")));
            return;
          }
          chunks.push(buffer);
        });
        res.on("end", () => finish(() => resolve({ status, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") })));
        res.on("error", (error) => finish(() => reject(error)));
      },
    );

    req.setTimeout(timeoutMs, () => req.destroy(new Error("Target HTTPS request timed out.")));
    if (options.signal) {
      if (options.signal.aborted) req.destroy(options.signal.reason);
      else options.signal.addEventListener("abort", () => req.destroy(options.signal?.reason), { once: true });
    }
    req.on("error", (error) => finish(() => reject(error)));
    req.end(options.body);
  });
}
