import { NextRequest, NextResponse } from "next/server";
import { enterpriseAccess } from "@/lib/enterprise/access";
import { hashIp } from "@/lib/enterprise/audit";
import { encryptEnterpriseSecret, opaqueToken } from "@/lib/enterprise/crypto";
import { validateOidcConfig } from "@/lib/enterprise/sso";
import { getEnterpriseStore } from "@/lib/enterprise/store";
import type { EnterpriseIdentityProvider } from "@/lib/enterprise/types";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";
import { getStore } from "@/lib/persistence";
import { clientIdentity } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
const safe = ({ configEncrypted: _config, scimTokenHash: _hash, ...item }: EnterpriseIdentityProvider) => item;

export async function GET(req: NextRequest) {
  const access = await enterpriseAccess(req, "identity:manage", new URL(req.url).searchParams.get("orgId"));
  if (!access) return json({ error: "Identity management permission required" }, 403);
  return json({ items: (await (await getEnterpriseStore()).list<EnterpriseIdentityProvider>(access.workspace.id, "identityProviders")).map(safe) });
}

export async function POST(req: NextRequest) {
  const access = await enterpriseAccess(req, "identity:manage", new URL(req.url).searchParams.get("orgId"));
  if (!access) return json({ error: "Identity management permission required" }, 403);
  try {
    const body = await readLimitedJson(req, 40_000) as Record<string, unknown>;
    const protocol = body.protocol === "saml" ? "saml" : body.protocol === "oidc" ? "oidc" : null;
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
    const domains = Array.isArray(body.domains) ? [...new Set(body.domains.filter((item): item is string => typeof item === "string").map((item) => item.trim().toLowerCase()).filter((item) => /^[a-z0-9.-]+\.[a-z]{2,63}$/.test(item)))].slice(0, 50) : [];
    if (!protocol || !name || !domains.length) return json({ error: "Protocol, name and verified login domains are required" }, 422);
    if (body.enforceSso === true && body.enabled !== true) return json({ error: "SSO enforcement requires an enabled identity provider" }, 409);
    const persistence = await getStore();
    const store = await getEnterpriseStore();
    for (const domain of domains) {
      if ((await persistence.getVerification(domain, access.workspace.orgId))?.status !== "verified") return json({ error: `Verify ${domain} in this organization before assigning it to SSO.` }, 403);
      if (await store.identityProviderByDomain(domain)) return json({ error: `${domain} is already assigned to an enterprise identity provider.` }, 409);
    }
    const config = validateOidcConfig(body.config, protocol);
    const scim = body.issueScimToken === true ? opaqueToken("out_scim") : null;
    const item = await store.createAudited<EnterpriseIdentityProvider>(access.workspace.id, "identityProviders", { protocol, name, domains, enabled: body.enabled === true, enforceSso: body.enforceSso === true, jitProvisioning: body.jitProvisioning === true, configEncrypted: encryptEnterpriseSecret(config), scimTokenHash: scim?.hash ?? null, scimTokenPrefix: scim?.prefix ?? null, lastSyncAt: null }, { actorType: access.actorType, actorId: access.actorId, action: "enterprise.identity_provider.created", resourceType: "identity_provider", requestId: req.headers.get("x-request-id"), ipHash: hashIp(clientIdentity(req)), detail: { protocol, domains, enforceSso: body.enforceSso === true, scimIssued: Boolean(scim) } });
    return json({ item: safe(item), scimToken: scim?.token }, 201);
  } catch (error) {
    return json({ error: (error as Error).message }, error instanceof RequestBodyError ? error.status : 422);
  }
}

export async function PATCH(req: NextRequest) {
  const access = await enterpriseAccess(req, "identity:manage", new URL(req.url).searchParams.get("orgId"));
  if (!access) return json({ error: "Identity management permission required" }, 403);
  try {
    const body = await readLimitedJson(req, 40_000) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    const store = await getEnterpriseStore();
    const current = await store.identityProvider(id);
    if (!current || current.workspaceId !== access.workspace.id) return json({ error: "Identity provider not found" }, 404);
    const patch: Partial<EnterpriseIdentityProvider> = {};
    for (const key of ["enabled", "enforceSso", "jitProvisioning"] as const) if (typeof body[key] === "boolean") patch[key] = body[key];
    if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 100);
    if (body.config !== undefined) patch.configEncrypted = encryptEnterpriseSecret(validateOidcConfig(body.config, current.protocol));
    const resultingEnabled = patch.enabled ?? current.enabled;
    const resultingEnforcement = patch.enforceSso ?? current.enforceSso;
    if (resultingEnforcement && !resultingEnabled) return json({ error: "SSO enforcement requires an enabled identity provider" }, 409);
    const item = await store.updateAudited<EnterpriseIdentityProvider>(access.workspace.id, "identityProviders", id, patch, { actorType: access.actorType, actorId: access.actorId, action: "enterprise.identity_provider.updated", resourceType: "identity_provider", requestId: req.headers.get("x-request-id"), ipHash: hashIp(clientIdentity(req)), detail: { fields: Object.keys(patch), configRotated: body.config !== undefined } });
    return json({ item: safe(item!) });
  } catch (error) {
    return json({ error: (error as Error).message }, error instanceof RequestBodyError ? error.status : 422);
  }
}

export async function DELETE(req: NextRequest) {
  const access = await enterpriseAccess(req, "identity:manage", new URL(req.url).searchParams.get("orgId"));
  if (!access) return json({ error: "Identity management permission required" }, 403);
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const store = await getEnterpriseStore();
  const provider = await store.identityProvider(id);
  if (!provider || provider.workspaceId !== access.workspace.id) return json({ error: "Identity provider not found" }, 404);
  if (provider.enabled || provider.enforceSso) return json({ error: "Disable SSO enforcement and the provider before deletion" }, 409);
  const [users, groups] = await Promise.all([store.list(access.workspace.id, "directoryUsers"), store.list(access.workspace.id, "directoryGroups")]);
  if (users.some((item) => item.identityProviderId === id) || groups.some((item) => item.identityProviderId === id)) return json({ error: "Retain the disabled provider while its provisioned directory objects exist" }, 409);
  const removed = await store.removeAudited(access.workspace.id, "identityProviders", id, { actorType: access.actorType, actorId: access.actorId, action: "enterprise.identity_provider.deleted", resourceType: "identity_provider", requestId: req.headers.get("x-request-id"), ipHash: hashIp(clientIdentity(req)), detail: {} });
  return json({ removed });
}
