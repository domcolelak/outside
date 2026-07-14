import { NextRequest } from "next/server";
import { getStore } from "@/lib/persistence";
import { getSessionContext, hasOrgRole } from "@/lib/auth";
import { InvalidTargetError, normalizeDomain } from "@/lib/security/target";
import { clientIdentity, rateLimit } from "@/lib/security/ratelimit";
import { resolveHost, resolveTxt } from "@/lib/discovery/providers";
import { isSafePublicIp } from "@/lib/security/target";
import { expectedTxtValue, isTokenInFile, isTokenPresent, issueToken, txtRecordName, WELL_KNOWN_PATH, wellKnownUrl } from "@/lib/verify/challenge";
import { verificationSecret } from "@/lib/config/secrets";
import { pinnedHttpsGet } from "@/lib/security/pinned-https";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/**
 * File-based verification. SSRF-guarded: the domain's resolved IPs must all be
 * public before we fetch; the connector pins the selected IP, preserves SNI,
 * refuses redirects, and caps the response body.
 */
async function checkFile(domain: string, token: string): Promise<boolean> {
  const rec = await resolveHost(domain).catch(() => null);
  const ips = [...(rec?.a ?? []), ...(rec?.aaaa ?? [])];
  if (ips.length === 0 || !ips.every(isSafePublicIp)) return false;

  try {
    const res = await pinnedHttpsGet(domain, ips, {
      path: WELL_KNOWN_PATH,
      timeoutMs: 6_000,
      maxBodyBytes: 4_096,
      headers: { accept: "text/plain", "user-agent": "OUTSIDE-verification/0.1" },
    });
    if (res.status < 200 || res.status >= 300) return false;
    return isTokenInFile(res.body, token);
  } catch {
    return false;
  }
}

/** GET /api/verify?domain=... — current verification status for the scan badge. */
export async function GET(req: NextRequest) {
  const raw = new URL(req.url).searchParams.get("domain") ?? "";
  let domain: string;
  try {
    domain = normalizeDomain(raw);
  } catch {
    return json({ status: "none" });
  }
  const store = await getStore();
  const v = await store.getVerification(domain);
  return json({ status: v?.status ?? "none", durable: store.durable });
}

/** POST /api/verify { domain, action: "start" | "check" }. */
export async function POST(req: NextRequest) {
  const client = clientIdentity(req);
  if (!(await rateLimit(`verify:${client}`, 20, 60_000)).ok) return json({ error: "Rate limit exceeded" }, 429);

  const ctx = await getSessionContext();
  if (!ctx) return json({ error: "Not authenticated" }, 401);

  let payload: { domain?: string; action?: string; orgId?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  let domain: string;
  try {
    domain = normalizeDomain(payload.domain ?? "");
  } catch (e) {
    return json({ error: e instanceof InvalidTargetError ? e.message : "Invalid domain" }, 422);
  }

  const store = await getStore();
  const existing = await store.getVerification(domain);

  if (payload.action === "start") {
    const orgId = String(payload.orgId ?? ctx.memberships[0]?.org.id ?? "");
    if (!orgId || !hasOrgRole(ctx, orgId, "admin")) return json({ error: "Organization admin access required" }, 403);
    if (existing?.orgId && existing.orgId !== orgId) return json({ error: "Domain is already claimed by another organization" }, 409);
    const token = existing?.token ?? issueToken(domain, verificationSecret());
    const v = await store.startVerification(domain, token, orgId);
    return json({
      status: v.status,
      recordType: "TXT",
      recordName: txtRecordName(domain),
      recordValue: expectedTxtValue(v.token),
      filePath: WELL_KNOWN_PATH,
      fileUrl: wellKnownUrl(domain),
      instructions: `Verify ownership by EITHER adding a DNS TXT record on ${domain} with the value below, OR hosting a file at ${WELL_KNOWN_PATH} containing it. Then click "Check verification". DNS changes can take a few minutes to propagate.`,
    });
  }

  if (payload.action === "check") {
    const v = existing;
    if (!v) return json({ error: "Start verification first." }, 409);
    if (!v.orgId || !hasOrgRole(ctx, v.orgId, "admin")) return json({ error: "Organization admin access required" }, 403);
    if (v.status === "verified") return json({ status: "verified", verifiedAt: v.verifiedAt });

    // Accept EITHER method: DNS TXT or the well-known file.
    let dnsOk = false;
    try {
      dnsOk = isTokenPresent(await resolveTxt(domain), v.token);
    } catch {
      /* fall through to file check */
    }
    const ok = dnsOk || (await checkFile(domain, v.token));
    if (ok) {
      const verified = await store.markVerified(domain);
      return json({ status: "verified", verifiedAt: verified.verifiedAt, method: dnsOk ? "dns" : "file" });
    }
    return json({ status: "pending", found: false, expected: expectedTxtValue(v.token) });
  }

  return json({ error: "Unknown action" }, 400);
}
