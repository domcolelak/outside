import dns from "node:dns/promises";
import https from "node:https";
import { isSafePublicIp } from "@/lib/security/target";

export interface GuardianHttpRequest {
  url: string;
  body: string;
  headers?: Record<string, string>;
}

/** Resolve, validate, then pin a POST request to defeat SSRF and DNS rebinding. */
export async function safeGuardianPost(request: GuardianHttpRequest, signal?: AbortSignal): Promise<void> {
  const url = new URL(request.url);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("Guardian integrations require a standard HTTPS endpoint.");
  const resolved = await dns.lookup(url.hostname, { all: true, verbatim: true });
  const addresses = [...new Set(resolved.map((row) => row.address))];
  if (!addresses.length || !addresses.every(isSafePublicIp)) throw new Error("Integration endpoint did not resolve exclusively to public addresses.");

  let lastError: unknown;
  for (const address of addresses) {
    try {
      await postAddress(url, address, request.body, request.headers, signal);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Integration delivery failed.");
}

function postAddress(url: URL, address: string, body: string, headers: Record<string, string> = {}, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (callback: () => void) => { if (!settled) { settled = true; callback(); } };
    const req = https.request({ hostname: address, port: 443, servername: url.hostname, rejectUnauthorized: true, agent: false, method: "POST", path: `${url.pathname}${url.search}`, headers: { host: url.hostname, "user-agent": "OUTSIDE-Guardian/1.0", "content-type": "application/json", "content-length": Buffer.byteLength(body), ...headers } }, (res) => {
      const status = res.statusCode ?? 0;
      let bytes = 0;
      res.on("data", (chunk: Buffer | string) => { bytes += Buffer.byteLength(chunk); if (bytes > 64_000) res.destroy(new Error("Integration response exceeded the size limit.")); });
      res.on("end", () => done(() => status >= 200 && status < 300 ? resolve() : reject(new Error(`Integration returned HTTP ${status}.`))));
      res.on("error", (error) => done(() => reject(error)));
    });
    req.setTimeout(10_000, () => req.destroy(new Error("Integration delivery timed out.")));
    if (signal) {
      if (signal.aborted) req.destroy(signal.reason);
      else signal.addEventListener("abort", () => req.destroy(signal.reason), { once: true });
    }
    req.on("error", (error) => done(() => reject(error)));
    req.end(body);
  });
}
