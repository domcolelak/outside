import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { getAuthStore, getSessionContext, type SessionContext } from "@/lib/auth";
import { getAgencyStore } from "./store";
import { hasAgencyPermission, type AgencyPermission, type AgencyRole, type AgencyWorkspace } from "./types";

export interface AgencyAccess { workspace: AgencyWorkspace; role: AgencyRole; actorId: string; via: "session" | "api_key"; scopes: string[]; session: SessionContext | null; }

export async function agencyAccess(req: NextRequest | null, permission: AgencyPermission, requestedAgencyId?: string | null): Promise<AgencyAccess | null> {
  const store = await getAgencyStore();
  const authorization = req?.headers.get("authorization") ?? "";
  if (authorization.startsWith("Bearer out_agency_")) {
    const secretHash = createHash("sha256").update(authorization.slice(7)).digest("hex");
    const key = await store.authenticateApiKey(secretHash, new Date());
    if (!key || (requestedAgencyId && key.agencyId !== requestedAgencyId) || (!key.scopes.includes("*") && !key.scopes.includes(permission))) return null;
    const workspace = await store.workspace(key.agencyId);
    if (!workspace) return null;
    const ownerOrg = await (await getAuthStore()).getOrganization(workspace.ownerOrgId);
    if (ownerOrg?.plan !== "agency") return null;
    return { workspace, role: "viewer", actorId: `api-key:${key.id}`, via: "api_key", scopes: key.scopes, session: null };
  }
  const session = await getSessionContext();
  if (!session?.user.emailVerifiedAt) return null;
  const resolved = requestedAgencyId
    ? await Promise.all([store.workspace(requestedAgencyId), store.membershipForUser(requestedAgencyId, session.user.id)]).then(([workspace, membership]) => workspace && membership ? { workspace, membership } : null)
    : await store.workspaceForUser(session.user.id);
  if (!resolved || !hasAgencyPermission(resolved.membership.role, permission)) return null;
  const ownerOrg = await (await getAuthStore()).getOrganization(resolved.workspace.ownerOrgId);
  if (ownerOrg?.plan !== "agency") return null;
  return { workspace: resolved.workspace, role: resolved.membership.role, actorId: session.user.id, via: "session", scopes: ["*"], session };
}
