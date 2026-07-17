import { NextRequest, NextResponse } from "next/server";
import { getSessionContext, hasOrgRole } from "@/lib/auth";
import { getMonitorStore } from "@/lib/monitoring";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  let body: { orgId?: string; enabled?: boolean };
  try {
    body = await readLimitedJson(req, 8_000) as typeof body;
  } catch (error) {
    return NextResponse.json({ error: error instanceof RequestBodyError ? error.message : "Invalid request" }, { status: error instanceof RequestBodyError ? error.status : 400 });
  }
  const orgId = String(body.orgId ?? "");
  if (!hasOrgRole(ctx, orgId, "analyst")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const store = await getMonitorStore();
  const { id } = await params;
  const updated = await store.setEnabled(id, orgId, body.enabled !== false);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ monitor: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const orgId = new URL(req.url).searchParams.get("orgId") ?? "";
  // Removing a monitor requires admin.
  if (!hasOrgRole(ctx, orgId, "admin")) return NextResponse.json({ error: "Admin access required to remove monitors." }, { status: 403 });
  const store = await getMonitorStore();
  const { id } = await params;
  const ok = await store.remove(id, orgId);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
