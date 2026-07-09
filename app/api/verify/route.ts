import { NextRequest } from "next/server";
import { getStore } from "@/lib/persistence";
import { InvalidTargetError, normalizeDomain } from "@/lib/security/target";
import { rateLimit } from "@/lib/security/ratelimit";
import { resolveTxt } from "@/lib/discovery/providers";
import { expectedTxtValue, isTokenPresent, issueToken, txtRecordName } from "@/lib/verify/challenge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECRET = process.env.OUTSIDE_VERIFY_SECRET ?? "outside-dev-verify-secret";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
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
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`verify:${ip}`, 20, 60_000).ok) return json({ error: "Rate limit exceeded" }, 429);

  let payload: { domain?: string; action?: string };
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

  if (payload.action === "start") {
    const existing = await store.getVerification(domain);
    const token = existing?.token ?? issueToken(domain, SECRET);
    const v = await store.startVerification(domain, token);
    return json({
      status: v.status,
      recordType: "TXT",
      recordName: txtRecordName(domain),
      recordValue: expectedTxtValue(v.token),
      instructions: `Add a DNS TXT record on ${domain} with the value below, then click "Check verification". DNS changes can take a few minutes to propagate.`,
    });
  }

  if (payload.action === "check") {
    const v = await store.getVerification(domain);
    if (!v) return json({ error: "Start verification first." }, 409);
    if (v.status === "verified") return json({ status: "verified", verifiedAt: v.verifiedAt });

    let records: string[] = [];
    try {
      records = await resolveTxt(domain);
    } catch {
      return json({ status: "pending", found: false, error: "DNS lookup failed. Try again shortly." });
    }
    if (isTokenPresent(records, v.token)) {
      const verified = await store.markVerified(domain);
      return json({ status: "verified", verifiedAt: verified.verifiedAt });
    }
    return json({ status: "pending", found: false, expected: expectedTxtValue(v.token) });
  }

  return json({ error: "Unknown action" }, 400);
}
