import { NextRequest, NextResponse } from "next/server";
import { agencyAccess } from "@/lib/agency/access";
import { getAgencyStore } from "@/lib/agency/store";
import { getGuardianStore } from "@/lib/guardian/store";
import { synchronizeClientSla } from "@/lib/agency/sla";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await agencyAccess(req, "clients:read", new URL(req.url).searchParams.get("agencyId")); if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const store = await getAgencyStore(); const clientId = (await params).id; const client = (await store.clients(access.workspace.id)).find((item) => item.id === clientId); if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  const [guardian, notes, shares] = await Promise.all([(await getGuardianStore()).overview(client.orgId), store.notes(access.workspace.id, client.id), store.findingShares(access.workspace.id, client.id)]); const sla = await synchronizeClientSla(store, client, guardian.recommendations);
  return NextResponse.json({ workspace: access.workspace, role: access.role, client, guardian, notes, shares, sla }, { headers: { "cache-control": "private, no-store" } });
}
