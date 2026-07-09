import { NextRequest, NextResponse } from "next/server";
import { getSessionContext, hasOrgRole } from "@/lib/auth";
import { getMonitorStore } from "@/lib/monitoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  let body: { orgId?: string; enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const orgId = String(body.orgId ?? "");
  if (!hasOrgRole(ctx, orgId, "analyst")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const store = await getMonitorStore();
  const updated = await store.setEnabled(params.id, orgId, body.enabled !== false);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ monitor: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const orgId = new URL(req.url).searchParams.get("orgId") ?? "";
  // Removing a monitor requires admin.
  if (!hasOrgRole(ctx, orgId, "admin")) return NextResponse.json({ error: "Admin access required to remove monitors." }, { status: 403 });
  const store = await getMonitorStore();
  const ok = await store.remove(params.id, orgId);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
