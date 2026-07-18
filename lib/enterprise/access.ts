import type { NextRequest } from "next/server";
import { getSessionContext, type SessionContext } from "@/lib/auth";
import { secretHash } from "./crypto";
import { featureForPermission, licenseActive, permissionsFor } from "./permissions";
import { getEnterpriseStore } from "./store";
import { ENTERPRISE_PERMISSIONS, type EnterpriseApiToken, type EnterpriseDirectoryGroup, type EnterpriseDirectoryUser, type EnterprisePermission, type EnterpriseRole, type EnterpriseRoleBinding, type EnterpriseWorkspace } from "./types";
import { workspaceInRegion } from "./residency";

export interface EnterpriseAccess {
  workspace: EnterpriseWorkspace; actorId: string; actorType: "user" | "api_token";
  permissions: Set<EnterprisePermission>; session: SessionContext | null; token: EnterpriseApiToken | null;
}

export async function enterpriseAccess(req: NextRequest | null, required: EnterprisePermission, requestedOrgId?: string | null, scope?: { type: string; id: string }): Promise<EnterpriseAccess | null> {
  const store = await getEnterpriseStore(); const authorization = req?.headers.get("authorization") ?? "";
  if (authorization.startsWith("Bearer out_enterprise_")) {
    const token = await store.authenticateApiToken(secretHash(authorization.slice(7)), new Date());
    if (!token) return null; const workspace = await store.workspace(token.workspaceId);
    const feature = workspace ? featureForPermission(required) : null, configuredScopes = Object.keys(token.scopes).length > 0, allowedIds = scope ? token.scopes[scope.type] : undefined, scoped = !scope || !configuredScopes || Array.isArray(allowedIds) && allowedIds.includes(scope.id);
    if (!workspace || !workspaceInRegion(workspace) || !licenseActive(workspace) || feature && !workspace.features.includes(feature) || (requestedOrgId && workspace.orgId !== requestedOrgId) || !token.permissions.includes(required) || !scoped) return null;
    return { workspace, actorId: `api-token:${token.id}`, actorType: "api_token", permissions: new Set(token.permissions), session: null, token };
  }
  const session = await getSessionContext(); if (!session?.user.emailVerifiedAt) return null;
  const memberships = requestedOrgId ? session.memberships.filter((item) => item.org.id === requestedOrgId) : session.memberships;
  for (const membership of memberships) {
    const workspace = await store.workspaceByOrg(membership.org.id); if (!workspace || !workspaceInRegion(workspace) || !licenseActive(workspace)) continue;
    const feature = featureForPermission(required); if (feature && !workspace.features.includes(feature)) continue;
    if (membership.role === "owner") return { workspace, actorId: session.user.id, actorType: "user", permissions: new Set(ENTERPRISE_PERMISSIONS), session, token: null };
    const [roles, bindings, users, groups] = await Promise.all([store.list<EnterpriseRole>(workspace.id, "roles"), store.list<EnterpriseRoleBinding>(workspace.id, "bindings"), store.list<EnterpriseDirectoryUser>(workspace.id, "directoryUsers"), store.list<EnterpriseDirectoryGroup>(workspace.id, "directoryGroups")]);
    const directoryUser = users.find((item) => item.userId === session.user.id && item.active); const groupIds = directoryUser ? groups.filter((group) => group.memberIds.includes(directoryUser.id)).map((group) => group.id) : [];
    const scopeTypes: Record<string, EnterpriseRoleBinding["scopeType"]> = { departmentIds: "department", assetIds: "asset", riskIds: "risk" };
    const permissions = permissionsFor({ principalIds: [session.user.id, ...groupIds], roles, bindings, scopeType: scope ? scopeTypes[scope.type] : undefined, scopeId: scope?.id });
    if (permissions.has(required)) return { workspace, actorId: session.user.id, actorType: "user", permissions, session, token: null };
  }
  return null;
}
