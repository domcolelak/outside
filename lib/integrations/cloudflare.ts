/**
 * Cloudflare connector — the first *real* integration (not preview-only).
 *
 * Operator-keyed (CLOUDFLARE_API_TOKEN). Read paths (verify, zones) are used to
 * prove the connection actually works and to scope what can be touched. The one
 * write path (createDnsTxt) is additive and reversible: it returns a handle that
 * deleteDnsRecord uses to roll the change back. Every write is meant to be
 * previewed, approved, applied, verified and — if needed — rolled back. Bounded
 * (timeout) and pinned to Cloudflare's single API host.
 */

const API = "https://api.cloudflare.com/client/v4";
const FETCH_TIMEOUT_MS = 10_000;

export function cloudflareConfigured(): boolean {
  return !!process.env.CLOUDFLARE_API_TOKEN?.trim();
}

function tokenOrThrow(override?: string): string {
  const t = override ?? process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!t) throw new Error("Cloudflare is not connected (no CLOUDFLARE_API_TOKEN).");
  return t;
}

interface CfEnvelope<T> { success: boolean; errors?: Array<{ message?: string }>; result: T }

async function cf<T>(path: string, init: RequestInit, token: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Cloudflare request timed out.")), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${API}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json", ...init.headers },
    });
    const body = (await res.json().catch(() => ({}))) as CfEnvelope<T>;
    if (!res.ok || body.success === false) {
      const detail = body.errors?.map((e) => e.message).filter(Boolean).join("; ") || `HTTP ${res.status}`;
      throw new Error(`Cloudflare API error: ${detail}`);
    }
    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

export interface CloudflareIdentity {
  valid: boolean;
  status?: string;
}

/** Read-only: prove the token works and is active. */
export async function verifyToken(override?: string): Promise<CloudflareIdentity> {
  const status = await cf<{ status?: string }>("/user/tokens/verify", { method: "GET" }, tokenOrThrow(override));
  return { valid: status?.status === "active", status: status?.status };
}

export interface CloudflareZone { id: string; name: string }

/** Read-only: the zones (domains) this token can act on — the connection's scope. */
export async function listZones(override?: string): Promise<CloudflareZone[]> {
  const zones = await cf<Array<{ id: string; name: string }>>("/zones?per_page=50", { method: "GET" }, tokenOrThrow(override));
  return zones.map((z) => ({ id: z.id, name: z.name }));
}

export interface DnsRecordHandle { zoneId: string; recordId: string; name: string; type: string; content: string }

/** Write (additive, reversible): create a TXT record. Returns a rollback handle. */
export async function createDnsTxt(zoneId: string, name: string, content: string, override?: string): Promise<DnsRecordHandle> {
  const rec = await cf<{ id: string }>(`/zones/${encodeURIComponent(zoneId)}/dns_records`, {
    method: "POST",
    body: JSON.stringify({ type: "TXT", name, content, ttl: 3600, comment: "Applied by OUTSIDE remediation (reversible)" }),
  }, tokenOrThrow(override));
  return { zoneId, recordId: rec.id, name, type: "TXT", content };
}

/** Roll a created record back. Idempotent-ish: a already-deleted record is treated as done. */
export async function deleteDnsRecord(handle: DnsRecordHandle, override?: string): Promise<boolean> {
  await cf<{ id: string }>(`/zones/${encodeURIComponent(handle.zoneId)}/dns_records/${encodeURIComponent(handle.recordId)}`, { method: "DELETE" }, tokenOrThrow(override));
  return true;
}
