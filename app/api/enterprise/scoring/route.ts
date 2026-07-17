import { NextRequest, NextResponse } from "next/server";
import { enterpriseAccess } from "@/lib/enterprise/access";
import { activeRiskException, applyScoringPolicies } from "@/lib/enterprise/policy";
import { getEnterpriseStore } from "@/lib/enterprise/store";
import type { EnterprisePolicy, EnterpriseRiskException } from "@/lib/enterprise/types";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await readLimitedJson(req, 20_000) as Record<string, unknown>;
    const severity = ["info", "low", "medium", "high", "critical"].includes(String(body.severity)) ? body.severity as "info" | "low" | "medium" | "high" | "critical" : null;
    const baseScore = Number(body.baseScore);
    const evidenceConfidence = Number(body.evidenceConfidence);
    const subjectType = String(body.subjectType ?? "finding").slice(0, 80);
    const subjectId = String(body.subjectId ?? "").slice(0, 240);
    if (!severity || !Number.isFinite(baseScore) || baseScore < 0 || baseScore > 100 || !Number.isFinite(evidenceConfidence) || evidenceConfidence < 0 || evidenceConfidence > 1 || !subjectId) return NextResponse.json({ error: "Valid deterministic scoring input is required" }, { status: 422 });
    const access = await enterpriseAccess(req, "findings:read", new URL(req.url).searchParams.get("orgId"), { type: `${subjectType}Ids`, id: subjectId });
    if (!access) return NextResponse.json({ error: "Enterprise finding access or resource scope required" }, { status: 403 });
    const store = await getEnterpriseStore();
    const [policies, exceptions] = await Promise.all([store.list<EnterprisePolicy>(access.workspace.id, "policies"), store.list<EnterpriseRiskException>(access.workspace.id, "exceptions")]);
    const result = applyScoringPolicies({ baseScore, severity, evidenceConfidence, assetTags: Array.isArray(body.assetTags) ? body.assetTags.filter((item): item is string => typeof item === "string").slice(0, 100) : [] }, policies);
    const exception = activeRiskException(exceptions, subjectType, subjectId);
    return NextResponse.json({ ...result, exception: exception ? { id: exception.id, reason: exception.reason, compensatingControls: exception.compensatingControls, expiresAt: exception.expiresAt } : null, deterministic: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: error instanceof RequestBodyError ? error.status : 422 });
  }
}
