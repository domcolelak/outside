import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { getAuthStore } from "@/lib/auth";
import { hashPassword } from "@/lib/auth/password";
import { secretHash } from "./crypto";
import { getEnterpriseStore } from "./store";
import type { AppendEnterpriseAuditInput } from "./store-model";
import type { EnterpriseDirectoryGroup, EnterpriseDirectoryUser, EnterpriseIdentityProvider, EnterpriseWorkspace } from "./types";

export const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User", SCIM_GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
export interface ScimAccess { provider: EnterpriseIdentityProvider; workspace: EnterpriseWorkspace; }
export async function scimAccess(req: NextRequest): Promise<ScimAccess | null> { const auth = req.headers.get("authorization") ?? ""; if (!auth.startsWith("Bearer out_scim_")) return null; const provider = await (await getEnterpriseStore()).authenticateScimToken(secretHash(auth.slice(7))); if (!provider) return null; const workspace = await (await getEnterpriseStore()).workspace(provider.workspaceId); return workspace ? { provider, workspace } : null; }
export function scimError(status: number, detail: string) { return { status, body: { schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], status: String(status), detail } }; }
export function scimFilter(value: string | null): { field: "userName" | "externalId" | "displayName"; value: string } | null { if (!value) return null; const match = /^(userName|externalId|displayName)\s+eq\s+"([^"\\]{1,320})"$/i.exec(value.trim()); if (!match) throw new Error("Only exact userName, externalId or displayName filters are supported."); return { field: match[1] as "userName" | "externalId" | "displayName", value: match[2]! }; }
export function scimUser(item: EnterpriseDirectoryUser, baseUrl: string) { return { schemas: [SCIM_USER_SCHEMA], id: item.id, externalId: item.externalId ?? undefined, userName: item.userName, displayName: item.displayName, active: item.active, emails: [{ value: item.userName, primary: true, type: "work" }], ...(item.departmentId ? { "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User": { department: item.departmentId } } : {}), meta: { resourceType: "User", location: `${baseUrl}/Users/${item.id}`, lastModified: item.updatedAt, created: item.createdAt } }; }
export function scimGroup(item: EnterpriseDirectoryGroup, baseUrl: string) { return { schemas: [SCIM_GROUP_SCHEMA], id: item.id, externalId: item.externalId ?? undefined, displayName: item.displayName, members: item.memberIds.map((value) => ({ value })), meta: { resourceType: "Group", location: `${baseUrl}/Groups/${item.id}`, lastModified: item.updatedAt, created: item.createdAt } }; }
export async function provisionScimUser(access: ScimAccess, body: Record<string, unknown>, audit: Omit<AppendEnterpriseAuditInput, "workspaceId" | "resourceId">): Promise<EnterpriseDirectoryUser> {
  const userName = typeof body.userName === "string" ? body.userName.trim().toLowerCase() : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 200) : userName.split("@")[0] ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userName) || !access.provider.domains.includes(userName.split("@")[1]!)) throw new Error("userName must belong to a verified identity-provider domain.");
  const store = await getEnterpriseStore();
  const directory = await store.list<EnterpriseDirectoryUser>(access.workspace.id, "directoryUsers");
  if (directory.some((item) => item.userName === userName)) throw new Error("SCIM user already exists.");
  const active = body.active !== false;
  if (active && directory.filter((item) => item.active).length >= access.workspace.licensedSeats) throw new Error("Enterprise licensed seat limit reached.");
  const passwordHash = await hashPassword(randomBytes(48).toString("base64url"));
  const externalId = typeof body.externalId === "string" ? body.externalId.slice(0, 320) : null;
  if (store.provisionScimUserAtomic) return store.provisionScimUserAtomic({ workspaceId: access.workspace.id, orgId: access.workspace.orgId, providerId: access.provider.id, email: userName, name: displayName, passwordHash, externalId, active }, audit);
  const provisioned = await (await getAuthStore()).provisionMembership({ email: userName, name: displayName, passwordHash, orgId: access.workspace.orgId, role: "viewer", provisionedBy: access.provider.id, active });
  return store.createAudited<EnterpriseDirectoryUser>(access.workspace.id, "directoryUsers", { identityProviderId: access.provider.id, userId: provisioned.user.id, externalId, userName, displayName, active, departmentId: null, attributes: {}, lastSyncedAt: new Date().toISOString() }, audit);
}
