import { NextRequest, NextResponse } from "next/server";
import { getAuthStore } from "@/lib/auth";
import { scimAccess, scimError, scimGroup, scimUser } from "@/lib/enterprise/scim";
import { getEnterpriseStore } from "@/lib/enterprise/store";
import type { EnterpriseDirectoryGroup, EnterpriseDirectoryUser } from "@/lib/enterprise/types";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";
import { clientIdentity, requireBudgets } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const out = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
const fail = (status: number, detail: string) => { const value = scimError(status, detail); return out(value.body, value.status); };
const memberValues = (value: unknown): string[] => Array.isArray(value) ? value.flatMap((member) => member && typeof member === "object" && typeof (member as Record<string, unknown>).value === "string" ? [(member as Record<string, unknown>).value as string] : []).slice(0, 5000) : [];

export async function GET(req: NextRequest, { params }: { params: Promise<{ resource: string; id: string }> }) {
  const access = await scimAccess(req);
  if (!access) return fail(401, "Valid SCIM bearer token required.");
  const { resource, id } = await params;
  const base = `${new URL(req.url).origin}/api/enterprise/scim/v2`;
  const store = await getEnterpriseStore();
  if (resource === "Users") {
    const item = (await store.list<EnterpriseDirectoryUser>(access.workspace.id, "directoryUsers")).find((row) => row.id === id && row.identityProviderId === access.provider.id);
    return item ? out(scimUser(item, base)) : fail(404, "User not found.");
  }
  if (resource === "Groups") {
    const item = (await store.list<EnterpriseDirectoryGroup>(access.workspace.id, "directoryGroups")).find((row) => row.id === id && row.identityProviderId === access.provider.id);
    return item ? out(scimGroup(item, base)) : fail(404, "Group not found.");
  }
  return fail(404, "SCIM resource not found.");
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ resource: string; id: string }> }) {
  const access = await scimAccess(req);
  if (!access) return fail(401, "Valid SCIM bearer token required.");
  if (!(await requireBudgets([{ key: `scim:${access.workspace.id}`, limit: 300, windowMs: 60_000 }, { key: `scim:${clientIdentity(req)}`, limit: 500, windowMs: 60_000 }])).ok) return fail(429, "SCIM rate limit exceeded.");
  const { resource, id } = await params;
  const store = await getEnterpriseStore();
  const base = `${new URL(req.url).origin}/api/enterprise/scim/v2`;
  try {
    const body = await readLimitedJson(req, 40_000) as Record<string, unknown>;
    const operations = Array.isArray(body.Operations) ? body.Operations : [];
    if (resource === "Users") {
      const current = (await store.list<EnterpriseDirectoryUser>(access.workspace.id, "directoryUsers")).find((item) => item.id === id && item.identityProviderId === access.provider.id);
      if (!current) return fail(404, "User not found.");
      const patch: Partial<EnterpriseDirectoryUser> = { lastSyncedAt: new Date().toISOString() };
      for (const raw of operations) {
        if (!raw || typeof raw !== "object") continue;
        const operation = raw as Record<string, unknown>;
        const path = String(operation.path ?? "").toLowerCase();
        const value = operation.value;
        const map = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
        if (path === "active" && typeof value === "boolean") patch.active = value;
        if (!path && typeof map.active === "boolean") patch.active = map.active;
        if (path === "displayname" && typeof value === "string") patch.displayName = value.slice(0, 200);
        if (!path && typeof map.displayName === "string") patch.displayName = map.displayName.slice(0, 200);
      }
      if (patch.active === true && !current.active && (await store.list<EnterpriseDirectoryUser>(access.workspace.id, "directoryUsers")).filter((item) => item.active).length >= access.workspace.licensedSeats) return fail(409, "Enterprise licensed seat limit reached.");
      const audit = { actorType: "scim" as const, actorId: access.provider.id, action: "enterprise.scim.user.updated", resourceType: "directory_user", requestId: req.headers.get("x-request-id"), ipHash: null, detail: { fields: Object.keys(patch) } };
      const item = store.updateScimUserAtomic
        ? await store.updateScimUserAtomic({ workspaceId: access.workspace.id, orgId: access.workspace.orgId, providerId: access.provider.id, id, patch }, audit)
        : await store.updateAudited<EnterpriseDirectoryUser>(access.workspace.id, "directoryUsers", id, patch, audit);
      if (!store.updateScimUserAtomic && typeof patch.active === "boolean" && current.userId) await (await getAuthStore()).setProvisionedMembershipActive(current.userId, access.workspace.orgId, access.provider.id, patch.active);
      return out(scimUser(item!, base));
    }
    if (resource === "Groups") {
      const current = (await store.list<EnterpriseDirectoryGroup>(access.workspace.id, "directoryGroups")).find((item) => item.id === id && item.identityProviderId === access.provider.id);
      if (!current) return fail(404, "Group not found.");
      const patch: Partial<EnterpriseDirectoryGroup> = { lastSyncedAt: new Date().toISOString() };
      let members = [...current.memberIds];
      for (const raw of operations) {
        if (!raw || typeof raw !== "object") continue;
        const operation = raw as Record<string, unknown>;
        const op = String(operation.op ?? "replace").toLowerCase();
        const path = String(operation.path ?? "");
        const lower = path.toLowerCase();
        const values = memberValues(operation.value);
        if (lower === "displayname" && typeof operation.value === "string") patch.displayName = operation.value.slice(0, 200);
        if (lower === "members") members = op === "add" ? [...new Set([...members, ...values])] : op === "remove" ? members.filter((item) => !values.includes(item)) : values;
        const filtered = /^members\[value eq "([^"\\]+)"\]$/i.exec(path);
        if (op === "remove" && filtered?.[1]) members = members.filter((item) => item !== filtered[1]);
      }
      const validUsers = new Set((await store.list<EnterpriseDirectoryUser>(access.workspace.id, "directoryUsers")).filter((item) => item.identityProviderId === access.provider.id).map((item) => item.id));
      if (members.some((memberId) => !validUsers.has(memberId))) return fail(400, "Every group member must be a user provisioned by this identity provider.");
      patch.memberIds = members.slice(0, 5000);
      const item = await store.updateAudited<EnterpriseDirectoryGroup>(access.workspace.id, "directoryGroups", id, patch, { actorType: "scim", actorId: access.provider.id, action: "enterprise.scim.group.updated", resourceType: "directory_group", requestId: req.headers.get("x-request-id"), ipHash: null, detail: { memberCount: patch.memberIds.length } });
      return out(scimGroup(item!, base));
    }
    return fail(404, "SCIM resource not found.");
  } catch (error) {
    return fail(error instanceof RequestBodyError ? error.status : 400, (error as Error).message);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ resource: string; id: string }> }) {
  const access = await scimAccess(req);
  if (!access) return fail(401, "Valid SCIM bearer token required.");
  const { resource, id } = await params;
  const store = await getEnterpriseStore();
  if (resource === "Users") {
    const current = (await store.list<EnterpriseDirectoryUser>(access.workspace.id, "directoryUsers")).find((item) => item.id === id && item.identityProviderId === access.provider.id);
    if (!current) return fail(404, "User not found.");
    if (store.deleteScimUserAtomic) {
      await store.deleteScimUserAtomic({ workspaceId: access.workspace.id, orgId: access.workspace.orgId, providerId: access.provider.id, id }, { actorType: "scim", actorId: access.provider.id, action: "enterprise.scim.user.deleted", resourceType: "directory_user", requestId: req.headers.get("x-request-id"), ipHash: null, detail: {} });
      return new NextResponse(null, { status: 204 });
    }
    if (current.userId) await (await getAuthStore()).setProvisionedMembershipActive(current.userId, access.workspace.orgId, access.provider.id, false);
    const groups = (await store.list<EnterpriseDirectoryGroup>(access.workspace.id, "directoryGroups")).filter((item) => item.identityProviderId === access.provider.id && item.memberIds.includes(id));
    for (const group of groups) await store.update<EnterpriseDirectoryGroup>(access.workspace.id, "directoryGroups", group.id, { memberIds: group.memberIds.filter((memberId) => memberId !== id), lastSyncedAt: new Date().toISOString() });
    const bindings = (await store.list(access.workspace.id, "bindings")).filter((item) => item.principalType === "user" && item.principalId === id);
    for (const binding of bindings) await store.remove(access.workspace.id, "bindings", binding.id);
    await store.removeAudited(access.workspace.id, "directoryUsers", id, { actorType: "scim", actorId: access.provider.id, action: "enterprise.scim.user.deleted", resourceType: "directory_user", requestId: req.headers.get("x-request-id"), ipHash: null, detail: { removedRoleBindings: bindings.length, updatedGroups: groups.length } });
    return new NextResponse(null, { status: 204 });
  }
  if (resource === "Groups") {
    const current = (await store.list<EnterpriseDirectoryGroup>(access.workspace.id, "directoryGroups")).find((item) => item.id === id && item.identityProviderId === access.provider.id);
    if (!current) return fail(404, "Group not found.");
    if (store.deleteScimGroupAtomic) {
      await store.deleteScimGroupAtomic({ workspaceId: access.workspace.id, providerId: access.provider.id, id }, { actorType: "scim", actorId: access.provider.id, action: "enterprise.scim.group.deleted", resourceType: "directory_group", requestId: req.headers.get("x-request-id"), ipHash: null, detail: {} });
      return new NextResponse(null, { status: 204 });
    }
    const bindings = (await store.list(access.workspace.id, "bindings")).filter((item) => item.principalType === "group" && item.principalId === id);
    for (const binding of bindings) await store.remove(access.workspace.id, "bindings", binding.id);
    await store.removeAudited(access.workspace.id, "directoryGroups", id, { actorType: "scim", actorId: access.provider.id, action: "enterprise.scim.group.deleted", resourceType: "directory_group", requestId: req.headers.get("x-request-id"), ipHash: null, detail: { removedRoleBindings: bindings.length } });
    return new NextResponse(null, { status: 204 });
  }
  return fail(404, "SCIM resource not found.");
}
