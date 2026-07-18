import { createHash } from "node:crypto";
import type { EnterpriseFeature, EnterpriseFeatureFlag, EnterprisePermission, EnterpriseRole, EnterpriseRoleBinding, EnterpriseWorkspace } from "./types";

export function licenseActive(workspace: EnterpriseWorkspace, now = new Date()): boolean {
  return ["active", "trial"].includes(workspace.licenseStatus) && (!workspace.expiresAt || new Date(workspace.expiresAt) > now);
}
export function featureEnabled(workspace: EnterpriseWorkspace, feature: EnterpriseFeature): boolean {
  return licenseActive(workspace) && workspace.features.includes(feature);
}
export function featureForPermission(permission: EnterprisePermission): EnterpriseFeature | null { if (permission === "identity:manage") return "sso"; if (permission === "scim:manage") return "scim"; if (permission === "roles:manage") return "advanced_rbac"; if (["audit:read", "audit:export"].includes(permission)) return "audit_exports"; if (permission === "hierarchy:manage") return "hierarchy"; if (permission === "ownership:manage") return "ownership"; if (["policies:manage", "approvals:request", "approvals:decide", "exceptions:manage"].includes(permission)) return "governance"; if (permission === "tokens:manage") return "api"; if (["integrations:manage", "tickets:manage"].includes(permission)) return "integrations"; if (permission === "reports:manage") return "reporting"; if (["retention:manage", "license:manage"].includes(permission)) return "data_controls"; return null; }
export function flagEnabled(flag: EnterpriseFeatureFlag | undefined, subjectId: string): boolean {
  if (!flag?.enabled) return false;
  if (flag.rollout >= 100) return true;
  if (flag.rollout <= 0) return false;
  const bucket = Number.parseInt(createHash("sha256").update(`${flag.key}:${subjectId}`).digest("hex").slice(0, 8), 16) % 100;
  return bucket < flag.rollout;
}

export function permissionsFor(input: { principalIds: string[]; roles: EnterpriseRole[]; bindings: EnterpriseRoleBinding[]; scopeType?: EnterpriseRoleBinding["scopeType"]; scopeId?: string | null }): Set<EnterprisePermission> {
  const ids = new Set(input.principalIds);
  const roles = new Map(input.roles.map((role) => [role.id, role]));
  const output = new Set<EnterprisePermission>();
  for (const binding of input.bindings) {
    if (!ids.has(binding.principalId)) continue;
    const expiresAt = typeof binding.conditions.expiresAt === "string" ? new Date(binding.conditions.expiresAt) : null, notBefore = typeof binding.conditions.notBefore === "string" ? new Date(binding.conditions.notBefore) : null, now = new Date();
    if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now) || notBefore && (!Number.isFinite(notBefore.getTime()) || notBefore > now)) continue;
    const scopeMatches = binding.scopeType === "organization" || (binding.scopeType === input.scopeType && binding.scopeId === input.scopeId);
    if (!scopeMatches) continue;
    for (const permission of roles.get(binding.roleId)?.permissions ?? []) output.add(permission);
  }
  return output;
}

export function can(permissions: Iterable<EnterprisePermission>, required: EnterprisePermission): boolean {
  for (const permission of permissions) if (permission === required) return true;
  return false;
}
