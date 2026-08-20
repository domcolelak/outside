import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { targetEntitlement } from "@/lib/auth/entitlements";
import { getExplainer } from "@/lib/ai/explainer";
import { saveAnalysis } from "@/lib/ai/persist";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";
import { sanitizeFinding, sanitizeScanResult } from "@/lib/http/scan-input";
import { normalizeDomain } from "@/lib/security/target";
import { clientIdentity, requireBudgets } from "@/lib/security/ratelimit";
import { CapacityError, withConcurrency } from "@/lib/security/concurrency";
import { recordUsage } from "@/lib/usage/record";
import { withOrgProviderKeys } from "@/lib/integrations/providers/org-keys";
import { currentLocale } from "@/lib/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(req: NextRequest) {
  const { locale } = await currentLocale();
  const ctx = await getSessionContext();
  if (!ctx) return json({ error: "Not authenticated" }, 401);
  let raw: unknown;
  try {
    raw = await readLimitedJson(req, 750_000);
  } catch (error) {
    return json(
      { error: (error as Error).message },
      error instanceof RequestBodyError ? error.status : 400,
    );
  }

  const body =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const finding = body.finding ? sanitizeFinding(body.finding) : null;
  let result = sanitizeScanResult(body.result ?? raw);
  let target = result?.target ?? "";
  if (finding && typeof body.target === "string") {
    try {
      target = normalizeDomain(body.target);
    } catch {
      if (/^[a-z0-9.-]{1,253}\.example$/i.test(body.target))
        target = body.target.toLowerCase();
    }
  }
  if ((!finding && !result) || !target)
    return json(
      { error: finding ? "Invalid finding" : "Invalid scan result" },
      422,
    );

  // The organization has to be resolved BEFORE the explainer is chosen: which
  // explainer is available depends on whether this organization has connected
  // its own model key, and that key is only in scope inside its credential
  // context. Prefer a paid membership, exactly as the paid-first lookup did.
  const entitlement =
    (await targetEntitlement(ctx, target, { paid: true, allowDemo: true })) ??
    (await targetEntitlement(ctx, target, { allowDemo: true }));
  if (!entitlement)
    return json({ error: "Verified target access is required" }, 403);

  // Narrowed values are passed in explicitly: a closure would lose the null checks above.
  const entitled = entitlement;
  const session = ctx;

  return withOrgProviderKeys(entitled.orgId, async () => {
    const explainer = getExplainer();
    // The hosted OpenAI explainer is a paid capability; the template is free.
    const hosted = explainer.kind !== "template";
    if (hosted && entitled.plan === "free")
      return json({ error: "A verified paid organization is required" }, 403);
    const limit = await requireBudgets([
      { key: "ai:global", limit: 120, windowMs: 60_000 },
      { key: `ai:client:${clientIdentity(req)}`, limit: 15, windowMs: 60_000 },
      {
        key: `ai:user:${session.user.id}`,
        limit: 50,
        windowMs: 24 * 60 * 60_000,
      },
      {
        key: `ai:org:${entitled.orgId}`,
        limit: entitled.plan === "agency" ? 1_000 : 250,
        windowMs: 30 * 24 * 60 * 60_000,
      },
    ]);
    if (!limit.ok)
      return json(
        { error: "AI usage limit exceeded", retryAfter: limit.retryAfter },
        429,
      );

    try {
      return await withConcurrency("ai:global", 8, 60_000, async () => {
        if (finding) {
          const explanation = await explainer.explainFinding(
            finding,
            target,
            locale,
          );
          await Promise.all([
            saveAnalysis({
              orgId: entitled.orgId,
              target,
              scanId: null,
              kind: "finding",
              source: explainer.kind,
              text: explanation,
            }),
            recordUsage(entitled.orgId, session.user.id, "ai"),
          ]);
          return json({ explanation, source: explainer.kind });
        }
        result = result!;
        const summary = await explainer.executiveSummary(result, locale);
        await Promise.all([
          saveAnalysis({
            orgId: entitled.orgId,
            target,
            scanId: result.scanId,
            kind: "summary",
            source: explainer.kind,
            text: summary,
          }),
          recordUsage(entitled.orgId, session.user.id, "ai"),
        ]);
        return json({ summary, source: explainer.kind });
      });
    } catch (error) {
      if (error instanceof CapacityError)
        return json({ error: error.message }, 503);
      console.error("[ai] explanation failed", error);
      return json({ error: "Explanation failed" }, 502);
    }
  });
}
