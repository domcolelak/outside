import { NextRequest, NextResponse } from "next/server";
import { getSessionContext, hasOrgRole } from "@/lib/auth";
import { verifyKey, subscribedDomains, looksLikeHibpKey } from "@/lib/integrations/hibp";
import { saveProviderKey, getConnectionSummary, getConnectionToken, deleteConnection } from "@/lib/integrations/connections";
import { clientIdentity, rateLimit } from "@/lib/security/ratelimit";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";
import { operationalLog } from "@/lib/observability/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDER = "hibp" as const;

async function authorize(orgId: string) {
  const ctx = await getSessionContext();
  if (!ctx) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  if (!ctx.user.emailVerifiedAt) return { error: NextResponse.json({ error: "Verify your email first." }, { status: 403 }) };
  if (!orgId || !hasOrgRole(ctx, orgId, "admin")) {
    return { error: NextResponse.json({ error: "Organization admin access is required." }, { status: 403 }) };
  }
  return { ctx };
}

/** Build the live status: a stored key is only "connected" once HIBP confirms it. */
async function liveStatus(orgId: string) {
  const summary = await getConnectionSummary(orgId, PROVIDER);
  if (!summary) return { stored: false, connected: false };

  const key = await getConnectionToken(orgId, PROVIDER);
  if (!key) return { stored: false, connected: false };

  const verification = await verifyKey(key);
  if (!verification.ok) {
    return { stored: true, connected: false, accountHint: summary.accountHint, error: { code: verification.code, message: verification.message } };
  }
  const domains = await subscribedDomains(key);
  return {
    stored: true,
    connected: true,
    accountHint: summary.accountHint,
    connectedAt: summary.connectedAt,
    subscription: verification.subscription,
    domainSearch: domains.ok
      ? { available: domains.domains.length > 0, hibpVerifiedDomains: domains.domains }
      : { available: false, hibpVerifiedDomains: [], error: domains.message },
  };
}

export async function GET(req: NextRequest) {
  const orgId = new URL(req.url).searchParams.get("orgId") ?? "";
  const auth = await authorize(orgId);
  if (auth.error) return auth.error;
  return NextResponse.json(await liveStatus(orgId), { headers: { "cache-control": "private, no-store" } });
}

/** Connect (or replace) the key. Saved only after a successful live test. */
export async function POST(req: NextRequest) {
  if (!(await rateLimit(`hibp:connect:${clientIdentity(req)}`, 8, 60_000)).ok) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  let body: { orgId?: string; key?: string };
  try {
    body = (await readLimitedJson(req, 4_000)) as typeof body;
  } catch (error) {
    return NextResponse.json({ error: error instanceof RequestBodyError ? error.message : "Invalid request." }, { status: 400 });
  }

  const orgId = String(body.orgId ?? "");
  const auth = await authorize(orgId);
  if (auth.error) return auth.error;

  const providedKey = String(body.key ?? "").trim();
  if (!looksLikeHibpKey(providedKey)) {
    return NextResponse.json({ error: "A HIBP API key is 32 hexadecimal characters." }, { status: 400 });
  }

  // Never store a key we could not verify — a connection is real only after HIBP
  // confirms it. The key is never echoed back or logged.
  const verification = await verifyKey(providedKey);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.message, code: verification.code }, { status: 400 });
  }

  await saveProviderKey(orgId, PROVIDER, providedKey, auth.ctx!.user.id);
  operationalLog("info", "integrations.hibp_connected", { orgId, subscription: verification.subscription.subscriptionName });
  return NextResponse.json(await liveStatus(orgId));
}

export async function DELETE(req: NextRequest) {
  const orgId = new URL(req.url).searchParams.get("orgId") ?? "";
  const auth = await authorize(orgId);
  if (auth.error) return auth.error;
  await deleteConnection(orgId, PROVIDER);
  operationalLog("info", "integrations.hibp_disconnected", { orgId });
  return NextResponse.json({ stored: false, connected: false });
}
