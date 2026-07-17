import { NextRequest, NextResponse } from "next/server";
import { deliverEnterpriseBatch } from "@/lib/enterprise/delivery";
import { getEnterpriseStore } from "@/lib/enterprise/store";
import { authorizeCronHeader } from "@/lib/security/cron-auth";
import { enforceEnterpriseRetention, runScheduledEnterpriseExports } from "@/lib/enterprise/operations";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) { const authorization = authorizeCronHeader(req.headers.get("authorization")); if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status }); const url = new URL(req.url), limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") ?? 25))), fleetLimit = Math.max(1, Math.min(500, Number(url.searchParams.get("workspaceLimit") ?? 100))), afterId = url.searchParams.get("after") ?? undefined, store = await getEnterpriseStore(); const options = { limit: fleetLimit, afterId }; const [deliveries, exports, retention] = await Promise.all([deliverEnterpriseBatch(store, limit), runScheduledEnterpriseExports(store, new Date(), options), enforceEnterpriseRetention(store, new Date(), options)]); return NextResponse.json({ deliveries, exports, retention, nextCursor: exports.nextCursor ?? retention.nextCursor }); }
