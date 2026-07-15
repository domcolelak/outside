import { NextRequest, NextResponse } from "next/server";
import { agencyAccess } from "@/lib/agency/access"; import { agencyAnalytics } from "@/lib/agency/analytics"; import { getAgencyStore } from "@/lib/agency/store";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) { const url = new URL(req.url); const access = await agencyAccess(req, "agency:read", url.searchParams.get("agencyId")); if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const days = Math.max(7, Math.min(365, Number(url.searchParams.get("days")) || 30)); return NextResponse.json(await agencyAnalytics(await getAgencyStore(), access.workspace.id, days), { headers: { "cache-control": "private, no-store" } }); }
