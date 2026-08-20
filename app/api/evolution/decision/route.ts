import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { isFounder } from "@/lib/auth/founder";
import { currentKevIndex } from "@/lib/analysis/kev";
import { resolveProposal } from "@/lib/evolution/evolution";
import { recordDecision, type EvolutionDecisionKind } from "@/lib/evolution/decisions";
import { operationalLog } from "@/lib/observability/log";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";
import { clientIdentity, requireBudgets } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: EvolutionDecisionKind[] = ["approved", "rejected"];

/**
 * Record a founder decision (approve / reject) on an Evolution proposal. The
 * decision persists and teaches Evolution what to surface next — a decided
 * proposal drops off the active list, and the founder's per-product affinity
 * reprioritises future proposals. It NEVER applies, writes, or deploys the
 * proposed change; approval only marks intent for a human to implement.
 */
export async function POST(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isFounder(ctx)) return NextResponse.json({ error: "Evolution is restricted to the product owner." }, { status: 403 });

  const budget = await requireBudgets([
    { key: `evolution:decision:user:${ctx.user.id}`, limit: 30, windowMs: 60_000 },
    { key: `evolution:decision:client:${clientIdentity(req)}`, limit: 60, windowMs: 60_000 },
  ]);
  if (!budget.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "retry-after": String(budget.retryAfter) } });

  let body: { proposalId?: unknown; decision?: unknown } | null;
  try {
    body = await readLimitedJson(req, 4_096) as typeof body;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request body" }, { status: error instanceof RequestBodyError ? error.status : 400 });
  }
  const proposalId = typeof body?.proposalId === "string" ? body.proposalId : "";
  const decision = body?.decision;
  if (!proposalId) return NextResponse.json({ error: "proposalId is required" }, { status: 400 });
  if (typeof decision !== "string" || !KINDS.includes(decision as EvolutionDecisionKind)) {
    return NextResponse.json({ error: "decision must be 'approved' or 'rejected'" }, { status: 400 });
  }

  const target = resolveProposal(currentKevIndex(), proposalId);
  if (!target) return NextResponse.json({ error: "Unknown proposal" }, { status: 404 });

  await recordDecision({ proposalId, cveId: target.cveId, product: target.product, decision: decision as EvolutionDecisionKind, actor: ctx.user.email });
  operationalLog("info", "evolution.decision", { proposalId, product: target.product, decision });
  return NextResponse.json({ ok: true, proposalId, decision });
}
