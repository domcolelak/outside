import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { decryptEnterpriseSecret } from "@/lib/enterprise/crypto";
import { getEnterpriseStore } from "@/lib/enterprise/store";
import type { EnterpriseTicketLink } from "@/lib/enterprise/types";
import { readLimitedText, RequestBodyError } from "@/lib/http/body";
import { clientIdentity, requireBudgets } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const provider = (await params).provider;
  const integrationId = req.headers.get("x-outside-integration-id") ?? "";
  const timestamp = req.headers.get("x-outside-timestamp") ?? "";
  const signature = req.headers.get("x-outside-signature")?.replace(/^v1=/, "") ?? "";
  if (!integrationId || !/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return NextResponse.json({ error: "Valid signed webhook timestamp required" }, { status: 401 });
  if (!(await requireBudgets([{ key: `enterprise:ticket-hook:${integrationId}`, limit: 300, windowMs: 60_000 }, { key: `enterprise:ticket-hook:${clientIdentity(req)}`, limit: 500, windowMs: 60_000 }])).ok) return NextResponse.json({ error: "Webhook rate exceeded" }, { status: 429 });
  try {
    const raw = await readLimitedText(req, 100_000);
    const store = await getEnterpriseStore();
    const integration = await store.integration(integrationId);
    if (!integration || integration.provider !== provider || integration.category !== "ticketing" || !integration.enabled) return NextResponse.json({ error: "Integration not found" }, { status: 404 });
    const config = decryptEnterpriseSecret<Record<string, string>>(integration.configEncrypted);
    const secret = config.inboundSecret;
    if (!secret) return NextResponse.json({ error: "Inbound synchronization is not configured" }, { status: 409 });
    const expected = Buffer.from(createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex"));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return NextResponse.json({ error: "Webhook signature is invalid" }, { status: 401 });
    const body = JSON.parse(raw) as Record<string, unknown>;
    const externalId = String(body.externalId ?? body.id ?? "").slice(0, 240);
    const status = String(body.status ?? "open").slice(0, 80);
    const findingId = String(body.findingId ?? "").slice(0, 240);
    const inboundId = String(body.eventId ?? body.webhookId ?? createHash("sha256").update(`${timestamp}.${raw}`).digest("hex")).slice(0, 240);
    const links = await store.list<EnterpriseTicketLink>(integration.workspaceId, "tickets");
    const existing = links.find((item) => item.provider === provider && (item.externalId === externalId || findingId && item.findingId === findingId));
    if (!existing) return NextResponse.json({ error: "Ticket correlation was not found" }, { status: 404 });
    if (existing.metadata.lastInboundId === inboundId) return NextResponse.json({ synchronized: true, replay: true, version: existing.syncVersion });
    const item = await store.updateTicketInboundAudited(integration.workspaceId, existing.id, existing.syncVersion, { status, syncVersion: existing.syncVersion + 1, lastSyncedAt: new Date().toISOString(), metadata: { ...existing.metadata, inboundEvent: String(body.event ?? "updated").slice(0, 100), lastInboundId: inboundId } }, { actorType: "system", actorId: `ticket-webhook:${integration.id}`, action: "enterprise.ticket.synchronized", resourceType: "ticket", requestId: req.headers.get("x-request-id"), ipHash: null, detail: { provider, status, inboundId, syncVersion: existing.syncVersion + 1 } });
    if (!item) { const latest = (await store.list<EnterpriseTicketLink>(integration.workspaceId, "tickets")).find((link) => link.id === existing.id); if (latest?.metadata.lastInboundId === inboundId) return NextResponse.json({ synchronized: true, replay: true, version: latest.syncVersion }); return NextResponse.json({ error: "Ticket changed concurrently; retry with the current provider state" }, { status: 409 }); }
    return NextResponse.json({ synchronized: true, replay: false, version: item?.syncVersion });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: error instanceof RequestBodyError ? error.status : 400 });
  }
}
