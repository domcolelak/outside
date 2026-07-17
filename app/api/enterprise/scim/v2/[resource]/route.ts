import { NextRequest, NextResponse } from "next/server";
import { getEnterpriseStore } from "@/lib/enterprise/store";
import { provisionScimUser, scimAccess, scimError, scimFilter, scimGroup, scimUser } from "@/lib/enterprise/scim";
import type { EnterpriseDirectoryGroup, EnterpriseDirectoryUser } from "@/lib/enterprise/types";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";
import { clientIdentity, requireBudgets } from "@/lib/security/ratelimit";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
const out = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } }); const fail = (status: number, detail: string) => { const value = scimError(status, detail); return out(value.body, value.status); };
export async function GET(req: NextRequest, { params }: { params: Promise<{ resource: string }> }) { const access = await scimAccess(req); if (!access) return fail(401, "Valid SCIM bearer token required."); const resource = (await params).resource, base = `${new URL(req.url).origin}/api/enterprise/scim/v2`;
  if (resource === "ServiceProviderConfig") return out({ schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"], patch: { supported: true }, bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 }, filter: { supported: true, maxResults: 200 }, changePassword: { supported: false }, sort: { supported: false }, etag: { supported: false }, authenticationSchemes: [{ type: "oauthbearertoken", name: "Bearer Token", description: "Workspace-scoped SCIM token", specUri: "https://www.rfc-editor.org/rfc/rfc6750", primary: true }] });
  if (resource === "ResourceTypes") return out({ schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"], totalResults: 2, startIndex: 1, itemsPerPage: 2, Resources: [{ id: "User", name: "User", endpoint: "/Users", schema: "urn:ietf:params:scim:schemas:core:2.0:User" }, { id: "Group", name: "Group", endpoint: "/Groups", schema: "urn:ietf:params:scim:schemas:core:2.0:Group" }] });
  if (resource === "Schemas") return out({ schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"], totalResults: 2, startIndex: 1, itemsPerPage: 2, Resources: [{ id: "urn:ietf:params:scim:schemas:core:2.0:User", name: "User", description: "OUTSIDE enterprise directory user", attributes: [{ name: "userName", type: "string", required: true, uniqueness: "server" }, { name: "displayName", type: "string" }, { name: "active", type: "boolean" }] }, { id: "urn:ietf:params:scim:schemas:core:2.0:Group", name: "Group", description: "OUTSIDE enterprise RBAC group", attributes: [{ name: "displayName", type: "string", required: true, uniqueness: "server" }, { name: "members", type: "complex", multiValued: true }] }] });
  if (!['Users','Groups'].includes(resource)) return fail(404, "SCIM resource not found."); try { const url = new URL(req.url), filter = scimFilter(url.searchParams.get("filter")), startIndex = Math.max(1, Number(url.searchParams.get("startIndex") ?? 1)), count = Math.max(1, Math.min(200, Number(url.searchParams.get("count") ?? 100))), store = await getEnterpriseStore(); if (resource === "Users") { let rows = (await store.list<EnterpriseDirectoryUser>(access.workspace.id, "directoryUsers")).filter((item) => item.identityProviderId === access.provider.id); if (filter) rows = rows.filter((item) => String(item[filter.field] ?? "").toLowerCase() === filter.value.toLowerCase()); const selected = rows.slice(startIndex - 1, startIndex - 1 + count); return out({ schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"], totalResults: rows.length, startIndex, itemsPerPage: selected.length, Resources: selected.map((item) => scimUser(item, base)) }); } let rows = (await store.list<EnterpriseDirectoryGroup>(access.workspace.id, "directoryGroups")).filter((item) => item.identityProviderId === access.provider.id); if (filter) rows = rows.filter((item) => String(item[filter.field] ?? "").toLowerCase() === filter.value.toLowerCase()); const selected = rows.slice(startIndex - 1, startIndex - 1 + count); return out({ schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"], totalResults: rows.length, startIndex, itemsPerPage: selected.length, Resources: selected.map((item) => scimGroup(item, base)) }); } catch (error) { return fail(400, (error as Error).message); } }
export async function POST(req: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  const access = await scimAccess(req);
  if (!access) return fail(401, "Valid SCIM bearer token required.");
  if (!(await requireBudgets([{ key: `scim:${access.workspace.id}`, limit: 300, windowMs: 60_000 }, { key: `scim:${clientIdentity(req)}`, limit: 500, windowMs: 60_000 }])).ok) return fail(429, "SCIM rate limit exceeded.");
  const resource = (await params).resource;
  const base = `${new URL(req.url).origin}/api/enterprise/scim/v2`;
  try {
    const body = await readLimitedJson(req, 40_000) as Record<string, unknown>;
    const store = await getEnterpriseStore();
    if (resource === "Users") {
      const item = await provisionScimUser(access, body, { actorType: "scim", actorId: access.provider.id, action: "enterprise.scim.user.created", resourceType: "directory_user", requestId: req.headers.get("x-request-id"), ipHash: null, detail: { userName: typeof body.userName === "string" ? body.userName.trim().toLowerCase() : "" } });
      return out(scimUser(item, base), 201);
    }
    if (resource === "Groups") {
      const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 200) : "";
      if (!displayName) return fail(400, "displayName is required.");
      const members = Array.isArray(body.members) ? body.members.flatMap((member) => member && typeof member === "object" && typeof (member as Record<string, unknown>).value === "string" ? [(member as Record<string, unknown>).value as string] : []).slice(0, 5000) : [];
      const validUsers = new Set((await store.list<EnterpriseDirectoryUser>(access.workspace.id, "directoryUsers")).filter((item) => item.identityProviderId === access.provider.id).map((item) => item.id));
      if (members.some((id) => !validUsers.has(id))) return fail(400, "Every group member must be a user provisioned by this identity provider.");
      const item = await store.createAudited<EnterpriseDirectoryGroup>(access.workspace.id, "directoryGroups", { identityProviderId: access.provider.id, externalId: typeof body.externalId === "string" ? body.externalId.slice(0, 320) : null, displayName, memberIds: members, attributes: {}, lastSyncedAt: new Date().toISOString() }, { actorType: "scim", actorId: access.provider.id, action: "enterprise.scim.group.created", resourceType: "directory_group", requestId: req.headers.get("x-request-id"), ipHash: null, detail: { displayName, memberCount: members.length } });
      return out(scimGroup(item, base), 201);
    }
    return fail(404, "SCIM resource not found.");
  } catch (error) {
    return fail(error instanceof RequestBodyError ? error.status : 409, (error as Error).message);
  }
}
