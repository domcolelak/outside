import { NextRequest, NextResponse } from "next/server";
import { enterpriseAccess } from "@/lib/enterprise/access";
import { hashIp } from "@/lib/enterprise/audit";
import { encryptEnterpriseSecret } from "@/lib/enterprise/crypto";
import { ENTERPRISE_PROVIDERS, validateProviderConfig } from "@/lib/enterprise/providers";
import { getEnterpriseStore } from "@/lib/enterprise/store";
import type { EnterpriseIntegration } from "@/lib/enterprise/types";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";
import { clientIdentity } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
const safe = ({ configEncrypted: _config, ...item }: EnterpriseIntegration) => item;
const eventTypes = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, 50) : [];
const severities = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && ["info", "low", "medium", "high", "critical"].includes(item)))].slice(0, 5) : [];

export async function GET(req: NextRequest) {
  const access = await enterpriseAccess(req, "integrations:manage", new URL(req.url).searchParams.get("orgId"));
  if (!access) return json({ error: "Integration management permission required" }, 403);
  return json({ catalog: ENTERPRISE_PROVIDERS, items: (await (await getEnterpriseStore()).list<EnterpriseIntegration>(access.workspace.id, "integrations")).map(safe) });
}

export async function POST(req: NextRequest) {
  const access = await enterpriseAccess(req, "integrations:manage", new URL(req.url).searchParams.get("orgId"));
  if (!access) return json({ error: "Integration management permission required" }, 403);
  try {
    const body = await readLimitedJson(req, 40_000) as Record<string, unknown>;
    const provider = typeof body.provider === "string" ? body.provider : "";
    const validated = validateProviderConfig(provider, body.config);
    if (!validated.ok) return json({ error: validated.error }, 422);
    const definition = ENTERPRISE_PROVIDERS[provider as keyof typeof ENTERPRISE_PROVIDERS];
    const requestedName = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
    const store = await getEnterpriseStore();
    const item = await store.createAudited<EnterpriseIntegration>(access.workspace.id, "integrations", { provider, category: definition.category, name: requestedName || definition.label, enabled: body.enabled !== false, configEncrypted: encryptEnterpriseSecret(validated.config), eventTypes: eventTypes(body.eventTypes), severities: severities(body.severities), status: "configured", lastDeliveryAt: null, lastError: null, createdBy: access.actorId }, { actorType: access.actorType, actorId: access.actorId, action: "enterprise.integration.created", resourceType: "integration", requestId: req.headers.get("x-request-id"), ipHash: hashIp(clientIdentity(req)), detail: { provider, category: definition.category } });
    return json({ item: safe(item) }, 201);
  } catch (error) {
    return json({ error: (error as Error).message }, error instanceof RequestBodyError ? error.status : 422);
  }
}

export async function PATCH(req: NextRequest) {
  const access = await enterpriseAccess(req, "integrations:manage", new URL(req.url).searchParams.get("orgId"));
  if (!access) return json({ error: "Integration management permission required" }, 403);
  try {
    const body = await readLimitedJson(req, 40_000) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    const store = await getEnterpriseStore();
    const current = await store.integration(id);
    if (!current || current.workspaceId !== access.workspace.id) return json({ error: "Integration not found" }, 404);
    const patch: Partial<EnterpriseIntegration> = {};
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 100);
    if (Array.isArray(body.eventTypes)) patch.eventTypes = eventTypes(body.eventTypes);
    if (Array.isArray(body.severities)) patch.severities = severities(body.severities);
    if (body.config !== undefined) {
      const validated = validateProviderConfig(current.provider, body.config);
      if (!validated.ok) return json({ error: validated.error }, 422);
      patch.configEncrypted = encryptEnterpriseSecret(validated.config);
      patch.status = "configured";
      patch.lastError = null;
    }
    const item = await store.updateAudited<EnterpriseIntegration>(access.workspace.id, "integrations", id, patch, { actorType: access.actorType, actorId: access.actorId, action: "enterprise.integration.updated", resourceType: "integration", requestId: req.headers.get("x-request-id"), ipHash: hashIp(clientIdentity(req)), detail: { fields: Object.keys(patch), credentialsRotated: body.config !== undefined } });
    return json({ item: safe(item!) });
  } catch (error) {
    return json({ error: (error as Error).message }, error instanceof RequestBodyError ? error.status : 422);
  }
}

export async function DELETE(req: NextRequest) {
  const access = await enterpriseAccess(req, "integrations:manage", new URL(req.url).searchParams.get("orgId"));
  if (!access) return json({ error: "Integration management permission required" }, 403);
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const store = await getEnterpriseStore();
  const integration = await store.integration(id);
  if (!integration || integration.workspaceId !== access.workspace.id) return json({ error: "Integration not found" }, 404);
  if (integration.enabled) return json({ error: "Disable the integration before deletion" }, 409);
  const removed = await store.removeAudited(access.workspace.id, "integrations", id, { actorType: access.actorType, actorId: access.actorId, action: "enterprise.integration.deleted", resourceType: "integration", requestId: req.headers.get("x-request-id"), ipHash: hashIp(clientIdentity(req)), detail: { provider: integration.provider } });
  return json({ removed });
}
