import dns from "node:dns/promises";
import { pinnedHttpsGet, type PinnedHttpsResponse } from "@/lib/security/pinned-https";

export async function safeEnterpriseRequest(urlValue: string, options: { method?: "GET" | "POST"; body?: string; headers?: Record<string, string>; maxBodyBytes?: number; timeoutMs?: number } = {}): Promise<PinnedHttpsResponse> {
  const url = new URL(urlValue);
  if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443") throw new Error("Enterprise egress requires a credential-free HTTPS URL on port 443.");
  const resolved = await dns.lookup(url.hostname, { all: true, verbatim: true });
  return pinnedHttpsGet(url.hostname, resolved.map((item) => item.address), { path: `${url.pathname}${url.search}`, method: options.method, body: options.body, headers: { "user-agent": "OUTSIDE-Enterprise/1.0", ...options.headers }, maxBodyBytes: options.maxBodyBytes ?? 1_000_000, timeoutMs: options.timeoutMs ?? 10_000 });
}

export async function safeEnterpriseJson<T>(url: string, options?: Parameters<typeof safeEnterpriseRequest>[1]): Promise<T> {
  const response = await safeEnterpriseRequest(url, options); if (response.status < 200 || response.status >= 300) throw new Error(`Enterprise provider returned HTTP ${response.status}.`);
  return JSON.parse(response.body) as T;
}
