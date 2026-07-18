import { NextRequest, NextResponse } from "next/server";
import { agencyAccess } from "@/lib/agency/access";
import { getAgencyStore } from "@/lib/agency/store";
import { cleanText } from "@/lib/agency/validation";
import { readLimitedJson } from "@/lib/http/body";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) { const agencyId = new URL(req.url).searchParams.get("agencyId"); const access = await agencyAccess(req, "clients:read", agencyId); if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const clientId = cleanText(new URL(req.url).searchParams.get("clientId"), 100); return NextResponse.json({ events: await (await getAgencyStore()).slaEvents(access.workspace.id, clientId || undefined) }, { headers: { "cache-control": "private, no-store" } }); }
export async function PATCH(req: NextRequest) { const agencyId = new URL(req.url).searchParams.get("agencyId"); const access = await agencyAccess(req, "clients:manage", agencyId); if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const body = await readLimitedJson(req, 10_000) as Record<string, unknown>; const id = cleanText(body.id, 100); const action = cleanText(body.action, 30); if (!id || !["acknowledge", "resolve"].includes(action)) return NextResponse.json({ error: "Invalid SLA action" }, { status: 422 }); const event = await (await getAgencyStore()).updateSlaEvent(access.workspace.id, id, action === "acknowledge" ? { acknowledgeBy: access.actorId } : { resolve: true }); return event ? NextResponse.json({ event }) : NextResponse.json({ error: "SLA event not found" }, { status: 404 }); }
